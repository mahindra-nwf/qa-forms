-- Staff sign-in: each person has a role and a PIN (stored only as a salted hash).
-- Wrong PINs are counted; after 5 in a row the account is locked for 5 minutes.

alter table staff
  add column if not exists role text not null default 'operator' check (role in ('operator', 'qa', 'admin')),
  add column if not exists pin_hash text,
  add column if not exists failed_attempts int not null default 0,
  add column if not exists locked_until timestamptz;

-- Who submitted, by account (staff_name stays as the printed name at the time).
alter table submissions add column if not exists staff_id text;
alter table submissions add column if not exists edited_by text;
grant update (edited_by) on submissions to service_role;

grant update (name, role, pin_hash, failed_attempts, locked_until) on staff to service_role;
