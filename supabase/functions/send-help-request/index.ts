// Deno Edge Function runtime — excluded from the app's tsc/eslint project (see
// ../../../tsconfig.json and eslint.config.js) because it targets Deno, not the React
// Native/Node toolchain the rest of this repo builds with. Deploy with
// `supabase functions deploy send-help-request`.
//
// Called directly by the app (supabase.functions.invoke in
// src/services/help-request.ts), same as activate-alarm -- JWT-verified by default, the
// caller's identity comes from their own Supabase session.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  SendHelpRequestError,
  sendHelpRequest,
  type PushMessage,
  type PushTokenRow,
  type RequesterProfile,
  type SendHelpRequestErrorCode,
} from './send-help-request.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type RequestBody = {
  friendProfileIds: string[];
  message: string;
};

function isRequestBody(value: unknown): value is RequestBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const body = value as { friendProfileIds?: unknown; message?: unknown };

  return (
    Array.isArray(body.friendProfileIds) &&
    body.friendProfileIds.every((id) => typeof id === 'string') &&
    typeof body.message === 'string'
  );
}

function errorStatus(code: SendHelpRequestErrorCode): number {
  switch (code) {
    case 'invalid_message':
    case 'no_recipients':
      return 400;
    case 'no_valid_friends':
      return 403;
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

  if (!response.ok) {
    console.error(
      '[send-help-request] Expo push send failed',
      await response.text(),
    );
  }
}

Deno.serve(async (request: Request) => {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRequestBody(payload)) {
    return new Response('friendProfileIds and message are required', {
      status: 400,
    });
  }

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
    const result = await sendHelpRequest(
      requesterProfileId,
      payload.friendProfileIds,
      payload.message,
      {
        listFriendProfileIds: async (profileId): Promise<string[]> => {
          const { data, error } = await supabase
            .from('friends_relations')
            .select('profile_id, friend_profile_id')
            .eq('status', 'accepted')
            .or(`profile_id.eq.${profileId},friend_profile_id.eq.${profileId}`);

          if (error) {
            throw new Error('Could not load the Friend list.', {
              cause: error,
            });
          }

          return (data ?? []).map((row) =>
            row.profile_id === profileId
              ? (row.friend_profile_id as string)
              : (row.profile_id as string),
          );
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
        listPushTokens: async (profileIds): Promise<PushTokenRow[]> => {
          const { data, error } = await supabase
            .from('push_tokens')
            .select('profile_id, token')
            .in('profile_id', profileIds);

          if (error) {
            throw new Error('Could not load push tokens.', { cause: error });
          }

          return data ?? [];
        },
        sendPush: sendExpoPush,
      },
    );

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    if (error instanceof SendHelpRequestError) {
      return new Response(
        JSON.stringify({ code: error.code, error: error.message }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: errorStatus(error.code),
        },
      );
    }

    console.error('[send-help-request] Unexpected error', error);

    return new Response(
      JSON.stringify({ code: 'unexpected_error', error: 'Unexpected error.' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
