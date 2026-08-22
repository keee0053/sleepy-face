// Deno Edge Function runtime — excluded from the app's tsc/eslint project (see ../../../tsconfig.json
// and eslint.config.js) because it targets Deno, not the React Native/Node toolchain the rest of
// this repo builds with. Deploy with `supabase functions deploy push-on-failure`.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  notifyFriendsOfFailure,
  unwrapRowOrThrow,
  unwrapRowsOrThrow,
  type FailedProfile,
  type FriendRelationRow,
  type PushMessage,
  type PushTokenRow,
} from './notify.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PhotosInsertPayload = {
  record: {
    profile_id: string;
  };
};

function isPhotosInsertPayload(value: unknown): value is PhotosInsertPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'record' in value &&
    typeof (value as { record?: unknown }).record === 'object' &&
    (value as { record: { profile_id?: unknown } }).record !== null &&
    typeof (value as { record: { profile_id?: unknown } }).record.profile_id ===
      'string'
  );
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

  // Expo returns HTTP 200 even when individual tokens are rejected (e.g. invalid format,
  // DeviceNotRegistered) — the per-message outcome is only visible in the response body,
  // so this always logs it rather than only on a non-2xx status.
  console.log(
    '[DEBUG-pushfn] Expo push response',
    JSON.stringify({ ok: response.ok, status: response.status, responseBody }),
  );

  if (!response.ok) {
    console.error('[push-on-failure] Expo push send failed', responseBody);
  }
}

Deno.serve(async (request: Request) => {
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');

  if (
    !webhookSecret ||
    request.headers.get('x-webhook-secret') !== webhookSecret
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload: unknown = await request.json();
  console.log('[DEBUG-pushfn] payload', JSON.stringify(payload));

  if (!isPhotosInsertPayload(payload)) {
    console.log(
      '[DEBUG-pushfn] payload did not match PhotosInsertPayload shape',
    );
    return new Response('Ignored: not a recognised photos insert payload', {
      status: 200,
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const messages = await notifyFriendsOfFailure(payload.record.profile_id, {
    getFailedProfile: async (profileId): Promise<FailedProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('id', profileId)
        .maybeSingle();

      console.log(
        '[DEBUG-pushfn] getFailedProfile',
        JSON.stringify({ data, error, profileId }),
      );

      return unwrapRowOrThrow(
        data,
        error,
        'Could not load the failed profile.',
      );
    },
    listFriendRelations: async (profileId): Promise<FriendRelationRow[]> => {
      const { data, error } = await supabase
        .from('friends_relations')
        .select('profile_id, friend_profile_id')
        .or(`profile_id.eq.${profileId},friend_profile_id.eq.${profileId}`);

      console.log(
        '[DEBUG-pushfn] listFriendRelations',
        JSON.stringify({ count: data?.length ?? 0, data, error, profileId }),
      );

      return unwrapRowsOrThrow(data, error, 'Could not load friend relations.');
    },
    listPushTokens: async (profileIds): Promise<PushTokenRow[]> => {
      const { data, error } = await supabase
        .from('push_tokens')
        .select('profile_id, token')
        .in('profile_id', profileIds);

      console.log(
        '[DEBUG-pushfn] listPushTokens',
        JSON.stringify({ count: data?.length ?? 0, data, error, profileIds }),
      );

      return unwrapRowsOrThrow(data, error, 'Could not load push tokens.');
    },
    sendPush: sendExpoPush,
  });

  console.log('[DEBUG-pushfn] messages built', JSON.stringify(messages));

  return new Response(JSON.stringify({ sent: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
