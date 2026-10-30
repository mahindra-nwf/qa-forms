-- Offline filling: an iPad can save a form while offline and send it later.
-- client_id is made on the iPad when Submit is pressed, so a record sent twice is saved once.
-- filled_at is the iPad's clock when Submit was pressed; submitted_at stays the server's receipt time.

alter table submissions add column if not exists client_id text;
alter table submissions add column if not exists filled_at timestamptz;
create unique index if not exists submissions_client_id on submissions (client_id) where client_id is not null;
