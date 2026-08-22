-- Comments: lets a viewer comment on a friend's Failure Card photo, viewed on a photo's
-- detail screen (reached by tapping the photo or the comment-bubble button in the Home
-- feed). Threaded replies ("comment on a comment") are an optional "better" feature, not
-- required yet -- parent_comment_id exists for that future use but stays nullable so a
-- normal top-level comment doesn't need one.
--
-- Deviates from the originally sketched column list in two ways: `photo_id` (not
-- `photp_id`, a typo) and `parent_comment_id` (not `coment_id`, both a typo and renamed
-- for clarity) is nullable rather than "not null" -- a NOT NULL self-reference would make
-- it impossible to insert a first, top-level comment on a photo.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

-- Comments must be visible to whoever can see the photo itself (the Home feed already
-- scopes which photos a viewer fetches via friends_relations); this policy just allows
-- reading the comment rows, same shape as photo_reactions' read policy.
create policy "Authenticated users can read comments"
on public.comments for select
to authenticated
using (true);

create policy "Users can add their own comments"
on public.comments for insert
to authenticated
with check (user_id = auth.uid());
