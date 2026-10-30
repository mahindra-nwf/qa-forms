-- Test mode: while allow_record_changes is true, submitted records can be edited and deleted.
-- Before real use, turn it off (records become permanent again):
--   update app_settings set allow_record_changes = false;

create table if not exists app_settings (
  id int primary key default 1 check (id = 1),
  allow_record_changes boolean not null default false
);
insert into app_settings (id, allow_record_changes) values (1, true) on conflict (id) do nothing;
alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;
grant select on app_settings to service_role;

alter table submissions add column if not exists edited_at timestamptz;
grant update (staff_name, "values", notes, edited_at), delete on submissions to service_role;

create or replace function block_submission_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select allow_record_changes from public.app_settings where id = 1) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Submitted QA records cannot be changed or deleted';
end $$;
