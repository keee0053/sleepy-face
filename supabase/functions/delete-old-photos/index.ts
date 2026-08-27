// Deno Edge Function runtime — excluded from the app's tsc/eslint project (see
// ../../../tsconfig.json and eslint.config.js) because it targets Deno, not the React
// Native/Node toolchain the rest of this repo builds with. Deploy with
// `supabase functions deploy delete-old-photos`.
//
// Invoked on a schedule via pg_cron + pg_net (see
// supabase/sql/2026-08-27_delete_old_photos_cron.sql), not directly by the app --
// verify_jwt stays on (the default), and the cron job authenticates with the service
// role key the same way any other scheduled Supabase Function does.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { deleteOldPhotos, type StalePhotoRow } from './delete-old-photos.ts';

Deno.serve(async (request: Request) => {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const deletedCount = await deleteOldPhotos({
      listStalePhotos: async (olderThan): Promise<StalePhotoRow[]> => {
        const { data, error } = await supabase
          .from('photos')
          .select('id, image_url')
          .lt('created_at', olderThan.toISOString());

        if (error) {
          throw new Error('Could not list stale photos.', { cause: error });
        }

        return data ?? [];
      },
      removeStorageObjects: async (bucket, paths): Promise<void> => {
        const { error } = await supabase.storage.from(bucket).remove(paths);

        if (error) {
          throw new Error('Could not remove Storage objects.', {
            cause: error,
          });
        }
      },
      deletePhotoRows: async (ids): Promise<void> => {
        const { error } = await supabase.from('photos').delete().in('id', ids);

        if (error) {
          throw new Error('Could not delete photo rows.', { cause: error });
        }
      },
    });

    return new Response(JSON.stringify({ deletedCount }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[delete-old-photos] Unexpected error', error);

    return new Response(
      JSON.stringify({ code: 'unexpected_error', error: 'Unexpected error.' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
