// Deno Edge Function runtime — excluded from the app's tsc/eslint project (see ../../../tsconfig.json
// and eslint.config.js) because it targets Deno, not the React Native/Node toolchain the rest of
// this repo builds with. Deploy with `supabase functions deploy activate-alarm`.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  activateAlarm,
  type ActivateAlarmDeps,
  type FailureLogEntryOwner,
  type PushMessage,
  type PushTokenRow,
} from './notify.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ActivateAlarmRequestPayload = {
  entryId: string;
};

function isActivateAlarmRequestPayload(
  value: unknown,
): value is ActivateAlarmRequestPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { entryId?: unknown }).entryId === 'string'
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
    '[DEBUG-activatealarm] Expo push response',
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Scoped to the caller's own JWT purely to identify who is activating -- this client
  // never reads/writes failure_log_entries itself, so it never depends on that table's
  // (deliberately caller-less) RLS update policy.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } =
    await callerClient.auth.getUser();

  if (userError || !userData.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isActivateAlarmRequestPayload(payload)) {
    return new Response("Bad request: missing 'entryId'", { status: 400 });
  }

  // Service role: this is the only writer permitted to set activated_at/activated_by
  // (see the failure_log_entries migration -- there is no client-facing update policy).
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const deps: ActivateAlarmDeps = {
    listPushTokens: async (profileId): Promise<PushTokenRow[]> => {
      const { data, error } = await serviceClient
        .from('push_tokens')
        .select('profile_id, token')
        .eq('profile_id', profileId);

      if (error) {
        throw new Error('Could not load push tokens.', { cause: error });
      }

      return data ?? [];
    },
    markActivated: async (
      entryId,
      activatedBy,
    ): Promise<FailureLogEntryOwner | null> => {
      const { data, error } = await serviceClient
        .from('failure_log_entries')
        .update({
          activated_at: new Date().toISOString(),
          activated_by: activatedBy,
        })
        .eq('id', entryId)
        .is('activated_at', null)
        .select('profile_id')
        .maybeSingle();

      if (error) {
        throw new Error('Could not mark the failure log entry activated.', {
          cause: error,
        });
      }

      return data;
    },
    sendPush: sendExpoPush,
  };

  const outcome = await activateAlarm(payload.entryId, userData.user.id, deps);

  if (outcome.status === 'already-activated-or-not-found') {
    return new Response(JSON.stringify({ status: outcome.status }), {
      headers: { 'Content-Type': 'application/json' },
      status: 409,
    });
  }

  return new Response(JSON.stringify({ sent: outcome.messages.length }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
