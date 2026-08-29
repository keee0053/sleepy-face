-- failure-photos never had a DELETE policy on storage.objects (only SELECT and
-- INSERT existed). deleteMyFailurePhoto (src/services/profile-photos.ts) runs the
-- Storage removal under the calling user's own auth, so every manual delete was
-- silently rejected by RLS and swallowed by its best-effort .catch(() => {}) -- the
-- DB row disappeared but the file stayed in Storage forever.
--
-- The scheduled delete-old-photos Edge Function is unaffected: it runs with the
-- service role key, which bypasses RLS entirely.

create policy "Users can delete their own failure photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'failure-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
