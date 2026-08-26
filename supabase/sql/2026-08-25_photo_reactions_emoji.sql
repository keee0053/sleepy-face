-- Lets a Photo Reaction carry which emoji the user picked, instead of always meaning
-- 😂. Existing rows (if any) default to 😂 so the column can be NOT NULL from the start.
alter table public.photo_reactions
  add column if not exists emoji text not null default '😂';

alter table public.photo_reactions
  drop constraint if exists photo_reactions_emoji_check;

alter table public.photo_reactions
  add constraint photo_reactions_emoji_check
  check (emoji in ('😂', '🤣', '😍', '😮', '😢', '👍'));
