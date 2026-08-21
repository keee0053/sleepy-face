// Deno Edge Function runtime — excluded from the app's tsc/eslint project (see ../../../tsconfig.json
// and eslint.config.js) because it targets Deno, not the React Native/Node toolchain the rest of
// this repo builds with. Deploy with `supabase functions deploy push-on-failure`.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  notifyFriendsOfFailure,
  type FailedProfile,
  type FriendPushToken,
  type FriendRelationRow,
  type PushMessage,
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

  if (!response.ok) {
    console.error(
      '[push-on-failure] Expo push send failed',
      await response.text(),
    );
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

  if (!isPhotosInsertPayload(payload)) {
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
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('id', profileId)
        .maybeSingle();

      return data;
    },
    listFriendRelations: async (profileId): Promise<FriendRelationRow[]> => {
      const { data } = await supabase
        .from('friends_relations')
        .select('profile_id, friend_profile_id')
        .or(`profile_id.eq.${profileId},friend_profile_id.eq.${profileId}`);

      return data ?? [];
    },
    listPushTokens: async (profileIds): Promise<FriendPushToken[]> => {
      const { data } = await supabase
        .from('profiles')
        .select('id, push_token')
        .in('id', profileIds);

      return data ?? [];
    },
    sendPush: sendExpoPush,
  });

  return new Response(JSON.stringify({ sent: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
