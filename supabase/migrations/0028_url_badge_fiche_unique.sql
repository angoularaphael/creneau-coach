-- URL du badge vendu sur la fiche unique. Service role seulement :
-- coach_deciplus_jobs n'est pas grantée à anon / authenticated.

alter table public.coach_deciplus_jobs
  add column if not exists deciplus_member_id text;

alter table public.coach_deciplus_jobs
  add column if not exists error text;

alter table public.coach_deciplus_jobs
  add column if not exists access_url text;

comment on column public.coach_deciplus_jobs.access_url is
  'URL Deciplus du badge pour ce créneau. Jamais dans un log, jamais grantée au navigateur.';

revoke all on public.coach_deciplus_jobs from anon, authenticated;
