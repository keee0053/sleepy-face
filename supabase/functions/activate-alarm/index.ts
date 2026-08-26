// Deno Edge Function runtime — excluded from the app's tsc/eslint project (see
// ../../../tsconfig.json and eslint.config.js) because it targets Deno, not the React
// Native/Node toolchain the rest of this repo builds with. Deploy with
// `supabase functions deploy activate-alarm`.
//
// Unlike push-on-failure (invoked by a database webhook with a shared secret), this
// function is called directly by the app (supabase.functions.invoke in
// src/services/wake-friends.ts) and so is JWT-verified by default -- the caller's
// identity comes from their own Supabase session, not a service credential.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  ActivateWakeFriendAlarmError,
  activateWakeFriendAlarm,
  isValidQuestionCount,
  type FailureLogEntryRow,
  type FriendRelationRow,
  type PushMessage,
  type PushTokenRow,
  type RequesterProfile,
} from './activate.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ActivateRequestBody = {
  entryId: string;
  questionCount?: number;
};

function isActivateRequestBody(value: unknown): value is ActivateRequestBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const body = value as { entryId?: unknown; questionCount?: unknown };

  return (
    typeof body.entryId === 'string' &&
    (body.questionCount === undefined ||
      isValidQuestionCount(body.questionCount))
  );
}

function errorStatus(code: ActivateWakeFriendAlarmError['code']): number {
  switch (code) {
    case 'entry_not_found':
      return 404;
    case 'cannot_activate_own_entry':
    case 'not_friends':
      return 403;
    case 'entry_expired':
      return 410;
  }
}

async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  const response = await fetch(EXPO_PUSH_URL, {
    body: JSON.stringify(messages),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const responseBody = await response.text();

  // Expo returns HTTP 200 even when individual tokens are rejected -- the per-message
  // outcome is only visible in the response body (see push-on-failure/index.ts).
  console.log(
    '[DEBUG-activate-alarm] Expo push response',
    JSON.stringify({ ok: response.ok, status: response.status, responseBody }),
  );

  if (!response.ok) {
    console.error('[activate-alarm] Expo push send failed', responseBody);
  }
}

Deno.serve(async (request: Request) => {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isActivateRequestBody(payload)) {
    return new Response('entryId is required', { status: 400 });
  }

  // Two clients: one scoped to the caller's own JWT, to resolve who they are under
  // RLS; one with the service role, to perform the cross-profile update/notify work
  // this function exists for (the requester's own RLS cannot see the target's push
  // tokens, nor update a row they don't own).
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } =
    await callerClient.auth.getUser();

  if (userError || !userData.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const requesterProfileId = userData.user.id;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const result = await activateWakeFriendAlarm(
      payload.entryId,
      requesterProfileId,
      {
        getEntry: async (entryId): Promise<FailureLogEntryRow | null> => {
          const { data, error } = await supabase
            .from('failure_log_entries')
            .select('id, profile_id, created_at, activated_at')
            .eq('id', entryId)
            .maybeSingle();

          if (error) {
            throw new Error('Could not load the Failure Log Entry.', {
              cause: error,
            });
          }

          return data;
        },
        getRequesterProfile: async (
          profileId,
        ): Promise<RequesterProfile | null> => {
          const { data, error } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', profileId)
            .maybeSingle();

          if (error) {
            throw new Error('Could not load the requester profile.', {
              cause: error,
            });
          }

          return data;
        },
        isFriend: async (requesterId, targetId): Promise<boolean> => {
          const { data, error } = await supabase
            .from('friends_relations')
            .select('profile_id, friend_profile_id')
            .eq('status', 'accepted')
            .or(
              `and(profile_id.eq.${requesterId},friend_profile_id.eq.${targetId}),and(profile_id.eq.${targetId},friend_profile_id.eq.${requesterId})`,
            );

          if (error) {
            throw new Error('Could not verify the friend relation.', {
              cause: error,
            });
          }

          return ((data ?? []) as FriendRelationRow[]).length > 0;
        },
        listPushTokens: async (profileId): Promise<PushTokenRow[]> => {
          const { data, error } = await supabase
            .from('push_tokens')
            .select('token')
            .eq('profile_id', profileId);

          if (error) {
            throw new Error('Could not load push tokens.', { cause: error });
          }

          return data ?? [];
        },
        markActivated: async (targetProfileId, now): Promise<void> => {
          const { error } = await supabase
            .from('failure_log_entries')
            .update({ activated_at: now.toISOString() })
            .eq('profile_id', targetProfileId)
            .is('activated_at', null);

          if (error) {
            throw new Error('Could not mark the entries activated.', {
              cause: error,
            });
          }
        },
        setPendingQuestionCount: async (
          targetProfileId,
          questionCount,
        ): Promise<void> => {
          const { error } = await supabase
            .from('profiles')
            .update({ pending_wake_friend_question_count: questionCount })
            .eq('id', targetProfileId);

          if (error) {
            throw new Error('Could not set the pending question count.', {
              cause: error,
            });
          }
        },
        sendPush: sendExpoPush,
      },
      undefined,
      payload.questionCount ?? null,
    );

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    if (error instanceof ActivateWakeFriendAlarmError) {
      return new Response(
        JSON.stringify({ code: error.code, error: error.message }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: errorStatus(error.code),
        },
      );
    }

    console.error('[activate-alarm] Unexpected error', error);

    return new Response(
      JSON.stringify({ code: 'unexpected_error', error: 'Unexpected error.' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
