-- Schedules delete-old-photos (see supabase/functions/delete-old-photos) to run daily,
-- deleting Photos (and their Storage objects) older than PHOTO_RETENTION_DAYS (14).
-- pg_cron runs the SQL below on Postgres's own clock; pg_net makes the HTTP call to the
-- deployed Edge Function.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- IMPORTANT: replace both placeholders below before running this in the SQL Editor --
-- <PROJECT_REF> is this project's ref (yqgxspuwhanfdzvvmeiy), and <SERVICE_ROLE_KEY> is
-- the service_role key from Project Settings > API. Never commit the real key -- this
-- file is checked in with placeholders only.
select cron.schedule(
  'delete-old-photos-daily',
  '0 18 * * *', -- 18:00 UTC = 03:00 JST
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/delete-old-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
