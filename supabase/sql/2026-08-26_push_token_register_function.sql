-- Reassigning a push token to a different profile via a plain upsert hits a Postgres
-- RLS + ON CONFLICT DO UPDATE edge case ("new row violates row-level security policy
-- (USING expression)") that a permissive `using (true)` UPDATE policy alone doesn't
-- reliably clear. A security definer function sidesteps the whole interaction: it runs
-- with elevated privilege and does the insert-or-reassign directly, while still only
-- ever writing the CALLER's own auth.uid() as profile_id (never an arbitrary one, since
-- that's hardcoded here, not caller-supplied).
create or replace function public.register_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.push_tokens (profile_id, token)
  values (auth.uid(), p_token)
  on conflict (token) do update set profile_id = excluded.profile_id;
$$;

revoke all on function public.register_push_token(text) from public;
grant execute on function public.register_push_token(text) to authenticated;
