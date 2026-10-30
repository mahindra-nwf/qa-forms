# Plant QA Forms

Web versions of the plant's paper QA forms. QA staff pick a form, fill it on a phone, tablet or PC, and every submission is kept with who filled it and when.

**Online (real records):** https://nwf-qa-forms.vercel.app (PINs are off while testing; see below)

**Demo (not saved):** https://mahindra-nwf.github.io/qa-forms/

There are three ways to run it:

| | Where records are saved | Who can open it |
|---|---|---|
| **Online (Vercel + Supabase)** | Supabase database | Anyone with the link (tap a name to sign in) |
| Plant network (`server.js`) | `data/` folder on the plant PC | Devices on the plant network |
| Demo (GitHub Pages) | Only in the visitor's browser | Anyone, not official records |

## Online version: one-time setup

1. **Supabase.** Create a project at supabase.com. Open **SQL Editor**, then paste and **Run** each file in `supabase/migrations/` in order.
2. **Vercel.** At vercel.com, choose **Add New > Project** and import the `qa-forms` GitHub repo. Leave the framework as "Other".
3. In the Vercel project, open **Settings > Environment Variables** and add:
   - `SUPABASE_URL`: from Supabase **Project Settings > Data API** (looks like `https://xxxx.supabase.co`)
   - `SUPABASE_SECRET_KEY`: from Supabase **Project Settings > API Keys**, the **secret** key (`sb_secret_...`)
   - `REQUIRE_PIN`: leave it out while testing. Set it to `true` before real use to turn PINs on.
4. Redeploy (**Deployments > ... > Redeploy**). Open the Vercel link on an iPad and fill a test form.
5. The first person to open the site creates the first **Admin** account (just a name while PINs are off). That admin then adds everyone else on the **Staff** page.

Never put the secret key anywhere except Vercel's environment variables.

### Staff sign-in (online version)

- **PINs are off for testing.** Each person taps their name to sign in. Anyone with the link can do this, so turn PINs on before real records are kept.
- **To turn PINs on:** in Vercel, add the environment variable `REQUIRE_PIN` = `true`, then redeploy. The sign-in screen then lists nobody: each person types their name and their own PIN (6 to 8 digits). An admin gives everyone a PIN on the Staff page first (Reset PIN).
- Either way, the signed-in name goes on every form they submit and cannot be changed on the form.
- Roles: **Operator** fills forms. **QA** can also edit and delete records while test mode is on. **Admin** can also add people, change roles, reset PINs and remove people.
- The device signs out after 5 idle minutes (never while a form is open). With PINs on, 5 wrong tries in a row lock that person out for 30 minutes.
- PINs are stored only as salted hashes. A forgotten PIN is reset by an admin.

The plant network version and the demo have no sign-in; names are typed as before.

### Working without internet (online version)

- The badge in the top bar shows **Online**, **Offline**, **N to send** or **Sending…**.
- Everything typed on a form is saved on the iPad as you go. Reopening the form brings it back.
- **Submit** always saves the record on the iPad first, then sends it. With no connection it waits and is sent automatically when the iPad is back online (checked every 20 seconds and as soon as Wi-Fi returns). Each record has an ID made on the iPad, so a record sent twice is saved once.
- Records keep both times: when Submit was pressed on the iPad (filled_at, iPad clock) and when the server received it (submitted_at, server clock).
- The page opens offline using the last copy saved on the iPad. Signing in needs internet; someone already signed in can keep working.
- Records waiting to send are listed at the top of **History**. They live in Safari on that iPad, so do not clear Safari website data or use Private Browsing until they are sent.

**Test mode is on.** While testing, records can be edited and deleted (a banner says so). Before real use, run this in Supabase **SQL Editor** to lock records permanently:

```sql
update app_settings set allow_record_changes = false;
```

Once locked, the database refuses every edit and delete. Staff names can always be added and removed.

## Plant network version

Needs [Node.js](https://nodejs.org) 18 or newer. No packages to install.

Double-click `start.bat`, or run `node server.js`. The window prints the address to open on this PC and on other devices. Submissions are saved as JSON files in `data/`, which is not committed to git. Back up that folder.

## Demo site

Every push to `main` publishes a demo to GitHub Pages. The demo has no server, so entries are saved only in the visitor's browser.

## Adding a form

Each form is one JSON file in `forms/`. The file name becomes the form's id. See `forms/receiving-log-001-cards.json` for an example. Field types: `text`, `textarea`, `number` (with `unit`), `select` (with `options`), `passfail` (optional `options`), `checkbox`, `date`, `time`, `table` (with `columns`, `rows`) and `matrix`. Tables with more than 6 columns show each row as a card.

Push to `main` and the online version, the demo and (after a restart) the plant server all pick up the new form.

## Tests

```bash
node --test
```
