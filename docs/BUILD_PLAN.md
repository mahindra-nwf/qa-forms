# FSQA Digital Logging Platform — Build Plan (rev. 2)

This replaces the original master build prompt. It keeps that prompt's record-integrity rules and cuts the scope to one facility. It also adds what the first version missed: logging in on shared iPads, reusing the forms already built in this repo, and stopping for review after each phase.

Give this whole file to the AI builder. Rule for the builder: **stop at the end of every phase and wait for the owner's approval before starting the next one.**

---

## 0. Decisions the owner must make

The builder must not guess these. Each one has a recommended default. If a decision is still open when a phase needs it, the builder uses the default, labels it `ASSUMED` in `docs/decisions.md` and reports it at the end of the phase.

| # | Decision | Needed by | Recommended default |
|---|---|---|---|
| D1 | How operators log in and sign on shared iPads | Phase 2 | Each employee gets a username (no email required) and a personal PIN of at least 6 digits. The iPad locks itself after 2 minutes idle. Signing asks for the PIN again. QA and admins log in with email + password + TOTP. |
| D2 | Who supplies approved limits, frequencies and corrective-action text, and by when | Phase 5 | The QA manager enters them from the HACCP plan and SOPs. Until then, demo seeds use limits clearly marked `SYNTHETIC`. |
| D3 | Is Wi-Fi reliable in every area where forms are filled (freezers, production, receiving dock)? | Phase 1 (site survey) | If any area is unreliable, Phase 7 (offline drafts) moves up to right after Phase 4. |
| D4 | Monthly hosting budget | Phase 1 | Supabase Pro + Vercel Pro (roughly $45–$70/month). Free tiers can't hold production records: Vercel Hobby is non-commercial only, and free Supabase projects pause when idle and lack the backups this needs. |
| D5 | What happens to the current local server and the records in `data/` | Phase 4 | Keep the local server running until cutover. Import historical `data/*.json` records as read-only `legacy` records and keep the original files as evidence. |
| D6 | Who maintains the system after it's built | Phase 8 | Name a person and a backup person. Document it in `docs/operations.md`. |
| D7 | How long paper and digital run in parallel, and who signs off on retiring paper | Phase 8 | At least 30 days of parallel running. The QA manager signs off. |

---

## 1. Context

- One facility, about 10 users. Products: frozen sushi, ready-to-eat meals and packaged prepared foods.
- Operators use iPads on the floor (portrait and landscape). QA uses iPads and desktops.
- During an FDA or customer audit, records must be retrievable quickly.
- **This repo already exists and must be built on, not replaced:**
  - `forms/*.json` holds 4 forms already digitized from the real paper logs: Receiving Log 001 (sheet and card layouts), Daily SSOP Inspection 056-A and Production Lot Number Log 045-A.
  - The current field types are `text`, `textarea`, `number` (with `unit`), `select`, `passfail`, `checkbox`, `date`, `time`, `table` (with `columns` and `rows`) and `matrix` (an items × columns checklist grid with tap-to-cycle ✓/✱ and an initials row).
  - `server.js` + `public/index.html` form a working local Node app that saves to `data/`. A GitHub Pages demo publishes from `main`.
  - The owner has approved two layouts: the "paper sheet" layout and full-width two-row cards on iPad. The light theme is the default.
- Multi-tenant SaaS for other manufacturers is a **later** goal. Version 1 keeps the data model ready for tenants and builds no SaaS operations features.

## 2. Product goals (version 1)

1. The floor experience is very simple: find the due log, fill it in, sign.
2. Digital forms match the existing paper forms in content and order.
3. Records are attributable, append-only and tamper-evident.
4. The system knows which records *should* exist and shows what is missing or overdue.
5. QA review and corrective actions are easy to track.
6. Audit retrieval is fast, by date, form or lot, with PDF export.

Not in version 1: AI features, OCR import, IoT or Bluetooth sensors, ERP, inventory, recall execution, billing, a marketing site, a native app, cross-facility analytics, complex notifications, platform admin tooling and invitation emails.

## 3. Stack

Next.js (App Router), strict TypeScript, React, Tailwind, shadcn/ui, Lucide, React Hook Form, Zod. Supabase (Postgres, Auth, private Storage, RLS) through `@supabase/ssr`; no deprecated auth helpers. Vercel hosting. Dexie for IndexedDB (only if Phase 7 is built). Vitest for unit tests, Playwright for end-to-end tests, and pgTAP or SQL tests for RLS. Sentry for errors. Server-side PDF generation with a maintained library; the builder chooses and justifies it.

Pin exact versions in `package.json`, checked against official docs at build time. It's a modular monolith: no separate backend, Redis, queues or Kubernetes.

Environments: `dev` (local Supabase via the CLI) and `prod`. A staging Supabase project is added before cutover (Phase 8), not before.

## 4. Roles (version 1)

| Role | Can | Cannot |
|---|---|---|
| Operator | See assigned and due logs, enter observations, save drafts, submit and sign "Performed by", view their own records, request corrections | Edit submitted records, review their own records, change templates or limits |
| QA | Everything an operator can, plus review and sign "Verified by", record deviations, manage corrective actions, see lot history, search, export | Delete records, change roles |
| Admin | Manage users, roles, lines, shifts, equipment and products. Publish form versions and monitoring requirements (QA manager approval is recorded) | Edit historical records |
| Auditor (read-only) | Search, view records with their full history, export evidence | Create, modify or sign anything |

Permissions are enforced in the database (RLS and checks inside functions), never only in the client. Roles are per facility, through `facility_memberships`. Public sign-up is disabled; admins create users.

**Shared-iPad requirements (D1):**
- Signing a user in on the floor must take under 10 seconds.
- The iPad locks itself after it sits idle. A locked screen shows no record data.
- The next user's session never sees the previous user's drafts.
- Logging out clears that user's local drafts from the device, or keeps them encrypted per user if Phase 7 is built.
- Every write records which user did it and which device it came from.

## 5. Data model

UUID keys. Every tenant-scoped table has `organization_id` (and `facility_id` where relevant) plus RLS, even though version 1 has one organization. That costs little now and makes the later SaaS move far cheaper.

- **Tenancy:** organizations, facilities, profiles, facility_memberships
- **Production:** production_lines, shifts, equipment, products, production_lots
- **Forms:** form_templates, form_versions (immutable once published; states `draft`, `published`, `retired`)
- **Scheduling:** monitoring_requirements, expected_checks (generated, with a unique `(requirement_id, due_at)` so generation is idempotent)
- **Records:** log_instances, observations, observation_revisions (append-only), record_signatures (bound to one revision), qa_reviews
- **Exceptions:** deviations, corrective_actions
- **Audit and documents:** audit_events (append-only), attachments (private bucket, paths scoped by tenant), exports
- **Legacy:** legacy_records (imported `data/*.json`, read-only, with the original file's hash)

These are kept as separate concepts: template, published version, requirement, expected check, log instance, observation, revision, signature and review. Form answers live in JSONB; ids, foreign keys, statuses and timestamps are typed columns. CHECK constraints enforce allowed states. Critical state changes (submit, sign, review, correct) run as single Postgres functions inside one transaction.

Tables are added in the phase that first needs them, not all in Phase 2.

## 6. Form engine

- **The existing `forms/*.json` format is the starting point.** Formalize it as a Zod schema, version it (`schemaVersion`) and extend it. The 4 existing forms must render in the new app with the same content and order. They are the form engine's acceptance tests.
- **Field types to keep:** all the current ones, including `matrix` and `table`.
- **Field types to add:** `integer`, `decimal`, `temperature` (with an explicit unit), `datetime`, `radio`, `yesnona`, `multiselect`, `photo`, `equipment`, `lot`, `acknowledgement`, `heading`, and conditional visibility (`showIf`, limited to simple comparisons on another field).
- **Layout hints:** `layout: "sheet" | "cards"` per form or per table. These are the two layouts the owner already approved.
- **One renderer:** a single `FormRenderer` component takes a validated published schema. Field ids are stable across versions.
- **Limits are data:** rules come from monitoring requirements, never from code. The engine flags a deviation and never changes the observed value.
- **No invented limits or frequencies (D2).** Synthetic ones must be labeled `SYNTHETIC` in both the seed and the UI.

## 7. Recording patterns

One engine supports all four patterns:

- **A. Shift log:** one log instance per shift, with many observations. Each observation keeps its own user and timestamp.
- **B. Lot log:** one log instance per production lot (for example Log 045-A).
- **C. Scheduled recurring check:** the system records when each check was due, not just when it was submitted.
- **D. Event log:** started by an event, such as a deviation, cleaning or equipment issue.

## 8. Expected-record engine (core differentiator)

- `monitoring_requirements` define what must be recorded, how often, and for which facility, shift, line, equipment, product and form.
- A scheduled job (Vercel Cron calling a protected route, or `pg_cron`) generates `expected_checks` for a rolling window.
- The job is idempotent: a unique key plus upsert, so retries or downtime never create duplicates. It catches up after downtime.
- **Check status values:** `upcoming`, `due`, `completed`, `overdue`, `missed`, `excused` (with a reason, a person and a timestamp), `pending_review`.
- **Time zones:** the facility's time zone is stored explicitly. All times are stored in UTC and shown in local time. Tests cover both DST transitions.
- Missing measurements are never fabricated or backfilled.
- **Version 1 scheduling:** per shift and fixed interval only.

## 9. Integrity, revisions and signatures

- **Append-only revisions.** A correction creates a new revision with a reason. Earlier revisions stay visible.
- **Database protection.** Database triggers and grants block UPDATE and DELETE on submitted revisions, signatures and audit events for every application role.
- **Idempotency.** Every write carries a client-generated idempotency key, which has a unique index.
- **Concurrency.** Every write sends the revision number it expects. A stale write is rejected with a conflict. Nothing uses last-write-wins.
- **Hash chain.** Each revision stores `sha256(prev_hash || canonical_json)`, and an integrity-check script verifies the chain. This is part of version 1 because it's cheap and gives tamper evidence.
- **Signature contents:** the authenticated user, the exact revision id and hash, what the signature means (`performed_by`, `verified_by`, `approved_by`), a server timestamp, and fresh re-authentication (the D1 PIN or password, checked server-side within 60 seconds).
- **Signatures never carry over.** A signature never moves to a newer revision; a corrected revision needs a new signature.
- **No offline signing.** Signing and final submission require being online.
- **Honest limits.** Document that a database superuser can still change data, and that the hash chain plus external archive (Phase 8) makes such changes detectable but not impossible.

## 10. QA review and corrective actions

- **QA dashboard sections:** awaiting review, overdue reviews, missing required fields, open deviations and corrective actions, recently corrected.
- **Review states:** `submitted`, `pending_review`, `needs_correction`, `verified`, `closed`. A corrective action runs in parallel and doesn't block the review state machine; closing a log with open corrective actions requires an explicit QA override with a reason.
- **Corrective-action fields:** the originating observation, the deviation, the observed value against the rule, the immediate action, the investigation, the lot disposition (entered by QA, never decided by the system), the person responsible, attachments, QA verification and closure.
- **Nothing closes by itself.** The system never auto-closes deviations or decides product safety.

## 11. Lot history and audit readiness

- **Lot History page:** every record linked to a lot, in time order.
- **Readiness view for a chosen period:** expected checks against completed, missed and overdue ones, records pending review, unsigned records and open corrective actions. Every number can be clicked through to the exact records behind it. The calculation is documented on the page. The page states that it is not a determination of compliance.
- **Search:** filter by date, shift, line, equipment, product, lot, form, employee, review status and deviation status. Filtering and pagination happen server-side.
- **Exports:** a PDF of a single record (original values, corrections, signatures and review history, laid out like the paper form); CSV of a filtered list; an audit package (a ZIP of PDFs, attachments and a manifest with SHA-256 checksums).
- **Export size and logging:** exports run synchronously up to a size cap. Each export records who ran it, its scope and the time.
- **Private storage:** exports and attachments sit in private storage behind short-lived signed URLs. There are no public links.

## 12. Offline (Phase 7, conditional on D3)

- **Local drafts only.** Drafts are stored in IndexedDB with visible states: `saved locally`, `pending sync`, `syncing`, `synced`, `failed`, `conflict`.
- **Sync safety.** Operation ids are generated on the device, and the server enforces idempotency. Both the device time and the server receipt time are kept.
- **Not official until accepted.** An offline draft is never shown as an official record. Submission and signing happen only online with a valid session.
- **Shared-device safety.** Drafts are scoped to one user, and switching users never exposes another user's drafts. Document that IndexedDB isn't guaranteed to be encrypted or durable.
- **Paper fallback.** Write a downtime procedure: blank paper forms are kept at each station and entered later as `paper-transcribed` records with an attached scan.

## 13. Security

- **Access paths.** RLS is on every tenant table and storage bucket. Every route handler and server action checks the authenticated user and their membership. The service-role key is used only in server code that does its own explicit authorization (the cron job and the legacy import).
- **Basic hardening.** Zod validation on every input, security headers, rate limits on login and PIN attempts (with lockout), session expiry, and no secrets in git (`.env.example` only).
- **Required tests:** an operator calling admin APIs, cross-tenant reads by guessed id, export or storage, an auditor trying to write, unauthorized signing, direct UPDATE/DELETE on revisions, and a stale or duplicate write.

## 14. Backup, retention and compliance support

- **Backups.** Supabase Pro daily backups. Add Point-in-Time Recovery if the budget allows (D4). A weekly encrypted export of the database and storage goes to a second location the owner controls. Restoring it is tested before cutover and then every quarter.
- **Retention.** Retention is configured per record category, with values supplied by QA. There is no automatic deletion in version 1; legal holds are a flag.
- **Compliance checklist.** `docs/compliance-checklist.md` lists what QA, regulatory and legal must validate before paper is retired: Seafood HACCP (21 CFR 123) where it applies, PCHF (21 CFR 117), Part 11 applicability, retention periods, signature procedure and the validation protocol.
- **No compliance claims.** Never claim the system is FDA-certified or Part 11-compliant.

## 15. Phases

**At the end of every phase**, report: files changed, migrations added, what works, which tests ran and their **actual** results, known gaps, the decisions needed, and the next phase. Then **stop and wait for approval.**

**Phase 1 — Foundation**
- Scaffold Next.js in `app/`, or migrate the repo root. Keep `forms/`, `server.js` and the Pages demo working until cutover.
- Set up Tailwind and shadcn, Supabase clients (browser and server, SSR), `.env.example`, lint, typecheck, Vitest, Playwright and CI on GitHub Actions.
- Build an app shell that fits the approved iPad layout.
- Write `docs/architecture.md` and `docs/decisions.md`. Record the D3 Wi-Fi survey result.
- **Done when:** the app builds, CI is green, and it runs locally against local Supabase.

**Phase 2 — Auth, tenancy and shared-iPad login**
- Tenancy and production tables with RLS.
- Admin creates users. D1 login: username + PIN for operators, email + TOTP for QA and admins.
- Idle lock and session isolation on shared devices.
- RLS and tenant-isolation tests, using two seeded organizations.
- **Done when:** each role sees only what it should, and the isolation tests pass.

**Phase 3 — Form engine**
- A Zod schema for the existing JSON format, plus `FormRenderer`.
- The 4 existing forms render in both layouts.
- New field types, conditional visibility, versioning (publish, retire) and a basic template admin page that uploads and validates JSON. A visual form builder is out of scope.
- **Done when:** the existing forms render and validate, and a published version can't be edited.

**Phase 4 — Submission, revisions, signatures and audit events**
- Transactional submit, sign and correct functions with idempotency, concurrency checks and the hash chain.
- A record detail page with full history.
- Legacy import from `data/` (D5).
- **Done when:** a signed record shows its full history, and the immutability, idempotency and conflict tests pass.

**Phase 5 — Scheduling and QA**
- Monitoring requirements and idempotent expected-check generation (DST tests).
- An operator "due now" dashboard.
- Missed and overdue detection.
- QA review, deviations, corrective actions and lot linkage.
- **Done when:** a missed check shows up, and an out-of-limit reading creates a deviation that QA works through to closure.

**Phase 6 — Audit readiness and export**
- Search, the readiness view, lot history, PDF and CSV export, and audit packages with a manifest.
- Export logging.
- **Done when:** an evidence package for a date range or lot downloads and its checksums verify.

**Phase 7 — PWA and offline drafts** (moves to after Phase 4 if D3 says Wi-Fi is unreliable)
- Manifest and caching of safe assets.
- Dexie drafts, sync states, conflict handling and the paper fallback procedure.
- Test on iPad Safari and the installed PWA.

**Phase 8 — Release readiness**
- Security review of RLS and all access paths.
- Staging project, backups and a restore test, plus the weekly external archive.
- Sentry, the Vercel production deploy, `docs/operations.md` (D6), the compliance checklist and the parallel-run plan (D7).
- **Done when:** this is a pilot candidate with its remaining risks listed.

## 16. MVP definition of done

A test operator and a QA reviewer, on an iPad against the real database:

1. The operator logs in with their PIN on a shared iPad.
2. They see a due check for their shift.
3. They fill in one of the real forms.
4. Validation blocks the submit until required fields are filled.
5. They sign online and get a record id.
6. The original values are preserved.
7. QA reviews and signs.
8. An out-of-limit value creates a deviation without changing the observed value.
9. QA opens the corrective action and closes it.
10. A check nobody did shows up as missed.
11. QA retrieves the record by date and by lot.
12. QA exports the record as a PDF showing its corrections, signatures and review history.
13. Every step is limited by role and facility.
14. The security and integrity test suites pass.

Before real regulated use, three more things are required: the backup, retention, recovery and validation documents are complete; the parallel run is finished; and QA has signed off.

## 17. Rules for the builder

1. **Inspect first.** Read the repo before changing it, and extend what exists.
2. **One phase at a time.** Stop for approval after each phase.
3. **Real data only.** Use real Supabase calls. Seed data is allowed only in seed files labeled as dev seeds.
4. **Honest test reports.** Never claim a test passed unless it was actually run.
5. **No hidden gaps.** Never silently skip a requirement. Unfinished work goes in `docs/decisions.md` or the phase report.
6. **No secrets.** Never ask for passwords or production secrets in chat, and never commit them.
7. **Protect production.** Get explicit approval before any destructive operation on production.
8. **Small and simple.** Keep files small and prefer simple solutions. Don't add an abstraction until it is needed twice.
