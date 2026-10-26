# Plant QA Forms

Web versions of the plant's paper QA forms. QA staff pick a form, fill it on a phone, tablet or PC, and every submission is kept with who filled it and when.

## Run it on the plant network

Needs [Node.js](https://nodejs.org) 18 or newer. No packages to install.

Double-click `start.bat`, or run `node server.js`. The window prints the address to open on this PC and on other devices. Submissions are saved as JSON files in `data/`, which is not committed to git. Back up that folder.

## Demo site

Every push to `main` publishes a demo to GitHub Pages. The demo has no server, so entries are saved only in the visitor's browser.

## Adding a form

Each form is one JSON file in `forms/`. The file name becomes the form's id. See `forms/receiving-log-001.json` for an example. Field types: `text`, `textarea`, `number` (with `unit`), `select` (with `options`), `passfail` (optional `options`), `checkbox`, `date`, `time`, and `table` (with `columns`, `rows`). Tables with more than 6 columns show each row as a card.
