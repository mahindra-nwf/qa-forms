-- Plant QA Forms: tables for the online (Vercel) version.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Only the Vercel API functions touch these tables, using the secret key.
-- RLS is on with no policies, so the public (publishable/anon) key can read nothing.

create table if not exists staff (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists staff_name_lower on staff (lower(name));

create table if not exists submissions (
  id text primary key,
  form_id text not null,
  form_name text not null,
  form_code text not null default '',
  category text not null default '',
  staff_name text not null check (length(trim(staff_name)) > 0),
  submitted_at timestamptz not null default now(),
  "values" jsonb not null default '{}',
  notes text not null default ''
);
create index if not exists submissions_submitted_at on submissions (submitted_at desc);
create index if not exists submissions_form_id on submissions (form_id, submitted_at desc);

alter table staff enable row level security;
alter table submissions enable row level security;

-- Browser-facing roles get nothing; only the server's secret key (service_role) is allowed in.
revoke all on staff, submissions from anon, authenticated;
grant select, insert, delete on staff to service_role;
grant select, insert on submissions to service_role;

-- Submitted records are permanent: no edits, no deletes, from any app key.
create or replace function block_submission_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'Submitted QA records cannot be changed or deleted';
end $$;

drop trigger if exists submissions_append_only on submissions;
create trigger submissions_append_only
  before update or delete on submissions
  for each row execute function block_submission_changes();
