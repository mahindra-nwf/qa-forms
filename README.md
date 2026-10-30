# Plant QA Forms

Web versions of the plant's paper QA forms. QA staff pick a form, fill it on a phone, tablet or PC, and every submission is kept with who filled it and when.

**Live demo:** https://mahindra-nwf.github.io/qa-forms/

There are three ways to run it:

| | Where records are saved | Who can open it |
|---|---|---|
| **Online (Vercel + Supabase)** | Supabase database | Anyone with the link **and** the plant access code |
| Plant network (`server.js`) | `data/` folder on the plant PC | Devices on the plant network |
| Demo (GitHub Pages) | Only in the visitor's browser | Anyone, not official records |

## Online version: one-time setup

1. **Supabase.** Create a project at supabase.com. Open **SQL Editor**, paste all of `supabase/migrations/001_qa_forms.sql`, and press **Run**.
2. **Vercel.** At vercel.com, choose **Add New > Project** and import the `qa-forms` GitHub repo. Leave the framework as "Other".
3. In the Vercel project, open **Settings > Environment Variables** and add:
   - `SUPABASE_URL`: from Supabase **Project Settings > Data API** (looks like `https://xxxx.supabase.co`)
   - `SUPABASE_SECRET_KEY`: from Supabase **Project Settings > API Keys**, the **secret** key (`sb_secret_...`)
   - `ACCESS_CODE`: a code you choose for the plant, at least 10 characters. Staff type it once on each iPad.
4. Redeploy (**Deployments > ... > Redeploy**). Open the Vercel link on an iPad, enter the access code, and fill a test form.

Never put the secret key anywhere except Vercel's environment variables.

Submitted records can't be edited or deleted, because the database blocks it. Staff names can be added and removed.

## Plant network version

Needs [Node.js](https://nodejs.org) 18 or newer. No packages to install.

Double-click `start.bat`, or run `node server.js`. The window prints the address to open on this PC and on other devices. Submissions are saved as JSON files in `data/`, which is not committed to git. Back up that folder.

## Demo site

Every push to `main` publishes a demo to GitHub Pages. The demo has no server, so entries are saved only in the visitor's browser.

## Adding a form

Each form is one JSON file in `forms/`. The file name becomes the form's id. See `forms/receiving-log-001.json` for an example. Field types: `text`, `textarea`, `number` (with `unit`), `select` (with `options`), `passfail` (optional `options`), `checkbox`, `date`, `time`, `table` (with `columns`, `rows`) and `matrix`. Tables with more than 6 columns show each row as a card.

Push to `main` and the online version, the demo and (after a restart) the plant server all pick up the new form.

## Tests

```bash
node --test
```
