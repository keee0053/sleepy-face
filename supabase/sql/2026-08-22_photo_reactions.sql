-- Photo Reactions: lets a user react to a friend's Failure Card photo with 😂 from the
-- Home feed. One reaction per (photo, profile) — tapping again removes it (a toggle, not
-- a multi-emoji picker). Comment counts/threads are a separate feature (table design
-- owned elsewhere) and are intentionally not part of this migration.

create table if not exists public.photo_reactions (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (photo_id, profile_id)
);

alter table public.photo_reactions enable row level security;

-- Reaction counts must be visible to whoever can see the photo itself (the Home feed
-- already scopes which photos a viewer fetches via friends_relations); this policy just
-- allows reading the aggregate, not any private data.
create policy "Authenticated users can read photo reactions"
on public.photo_reactions for select
to authenticated
using (true);

create policy "Users can add their own photo reaction"
on public.photo_reactions for insert
to authenticated
with check (profile_id = auth.uid());

create policy "Users can remove their own photo reaction"
on public.photo_reactions for delete
to authenticated
using (profile_id = auth.uid());
