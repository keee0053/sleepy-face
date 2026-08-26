-- Google Play requires letting a user delete content they posted. photos and comments
-- had no DELETE policy at all yet (see src/services/profile-photos.ts deleteMyFailurePhoto
-- and src/services/comments.ts deleteComment). Deleting a photo cascades to its comments
-- and reactions; deleting a top-level comment cascades to its replies (both already
-- declared `on delete cascade` when those tables were created).
create policy "Users can delete their own photos"
on public.photos for delete
to authenticated
using (profile_id = auth.uid());

create policy "Users can delete their own comments"
on public.comments for delete
to authenticated
using (user_id = auth.uid());
