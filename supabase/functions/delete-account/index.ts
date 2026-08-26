// Deno Edge Function runtime — excluded from the app's tsc/eslint project (see
// ../../../tsconfig.json and eslint.config.js) because it targets Deno, not the React
// Native/Node toolchain the rest of this repo builds with. Deploy with
// `supabase functions deploy delete-account`.
//
// Called directly by the app (supabase.functions.invoke in src/services/account.ts),
// so it's JWT-verified by default -- the caller can only ever delete their own account,
// since userId comes from their own session, never from the request body.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { deleteAccount } from './delete-account.ts';

Deno.serve(async (request: Request) => {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
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

  const userId = userData.user.id;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    await deleteAccount(userId, {
      deleteAuthUser: async (id) => {
        const { error } = await supabase.auth.admin.deleteUser(id);

        if (error) {
          throw new Error('Could not delete the auth user.', { cause: error });
        }
      },
      listStorageObjects: async (bucket, prefix) => {
        const { data, error } = await supabase.storage
          .from(bucket)
          .list(prefix);

        if (error) {
          throw new Error('Could not list storage objects.', { cause: error });
        }

        return data ?? [];
      },
      removeStorageObjects: async (bucket, paths) => {
        const { error } = await supabase.storage.from(bucket).remove(paths);

        if (error) {
          throw new Error('Could not remove storage objects.', {
            cause: error,
          });
        }
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[delete-account] Unexpected error', error);

    return new Response(
      JSON.stringify({ code: 'unexpected_error', error: 'Unexpected error.' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
