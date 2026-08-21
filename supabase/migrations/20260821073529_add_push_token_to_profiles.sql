alter table public.profiles
  add column if not exists push_token text;
