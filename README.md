# ARRAYS INGENIERIA — ERP & GST Compliance Platform

A production-grade, full-stack **business + GST compliance system** for
**ARRAYS INGENIERIA PRIVATE LIMITED** (a renewable-energy / solar EPC company).

It combines a financial ERP (payments, receipts, vendor/client/employee ledgers,
invoices, bank reconciliation, quotations, projects) with a complete
**enterprise GST compliance suite** (e-Invoice / IRP, e-Way Bill, reconciliation,
alerts, multi-branch/multi-GSTIN, governance, security, backup & disaster
recovery) — with **offline GST filing**: the software builds the NIC-schema JSON
locally, you bulk-upload it on the government portal, and the IRN / Ack / signed
QR are read straight back from the signed PDF. (No live IRP API is required.)

> Author: **Siddhant Kumar**

---

## Table of contents
1. [What it does](#what-it-does)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Running it locally](#running-it-locally)
5. [Roles & permissions](#roles--permissions)
6. [The financial ERP](#the-financial-erp)
7. [The GST compliance suite](#the-gst-compliance-suite)
8. [Security & governance](#security--governance)
9. [GST filing — the offline workflow](#going-live)
10. [Environment variables](#environment-variables)
11. [Local-first + Publish to Cloud](#local-first--publish-to-cloud)
12. [Verification & test suites](#verification--test-suites)
13. [Project layout](#project-layout)

---

## What it does

**Financial ERP**
- Outgoing **Payments** (with OCR auto-extraction from screenshots/PDFs), Incoming **Receipts**
- **Vendor / Client / Employee** ledgers with automatic posting from payments & receipts
- **Invoices** (proforma & GST tax) with settlement tracking
- **Bank reconciliation** — parses IDBI statements (PDF/Excel/CSV) and auto-matches
- **Quotations / solar estimation**, **Projects & Sites**, **Reports & exports** (Excel/PDF)
- Professional, no-truncation PDF exports; DD/MM/YYYY dates; date-range/FY presets

**GST compliance suite** (separate workspace, never merged with the ERP ledger)
- **e-Invoice** (IRP) — schema-accurate **v1.1** payloads, validate → submit → **IRN + Ack + signed QR**, print PDF, signed-JSON download, lawful cancellation
- **e-Way Bill** — separate object; Part A / Part B, generate, update Part B, extend, cancel, reject, close; generate-from-invoice
- **Reconciliation Center**, **Alerts**, **Activity Timeline**, **API Health**
- **Multi-branch / multi-GSTIN** + FY-aware **invoice number series**
- **Customer GST validation**, **duplicate prevention**, **document attachments**
- **Maker-checker** approvals, **read-only Auditor mode**, **2-step security verification**
- **Scheduled reports**, **data import wizard**, **backup & disaster recovery**
- **Diagnostics** and a **production-readiness review**

GST documents are filed **offline** (there is no live IRP API): build the
e-Invoice / e-Way-Bill JSON here, click **Upload on GST Portal**, bulk-upload it,
then bring the IRN / Ack number / signed QR back by uploading the portal's signed
PDF (read automatically). The app presents this as the green **“Live — offline
filing”** status.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Recharts, axios, lucide-react |
| Backend | Node.js (ESM) + Express, PostgreSQL via `pg` |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs`, role-based access control |
| OCR | `tesseract.js` (images) + `pdfjs-dist` (PDFs, in-process) |
| Files | `multer` uploads; PDFs via `pdfkit`; QR via `qrcode`; spreadsheets via `exceljs` / SheetJS (`xlsx`) |
| Hosting | Local-first (Postgres + Node). Optional cloud: Neon (DB) + Render (API) + Netlify (UI) |

Notable: **no native/compiled dependencies** — everything is pure JS or WASM, so
it runs on any Windows architecture without build tools.

---

## Architecture

```
client/                     React SPA (Vite). Talks to /api.
server/
  src/
    index.js                Express app; also serves the built client (single-port desktop mode)
    config/                 db, env, company profile
    middleware/             auth (JWT), rbac, upload, error, audit
    routes/                 REST endpoints (payments, receipts, vendors, …, gst)
    services/
      gst/                  the GST compliance engine (see below)
    db/
      schema.sql            core ERP schema
      gst-schema.sql        GST module schema (separate file)
      migrate.js            applies both, idempotent
      seed.js               demo users + data
```

**The GST engine is adapter-based.** All portal access goes through a single
pluggable adapter (`services/gst/adapter.js`):

```
UI → routes → services → getAdapter()  →  SimulationAdapter   (today)
                                       →  LiveAdapter (stub)   (drop in GSP creds → live)
```

- **Separate compliance objects:** `gst_einvoices` and `gst_eway_bills` are never merged.
- **Immutable logs:** `gst_api_logs` (every request/response) and `gst_audit_events`
  (every state change) are append-only — DB triggers block UPDATE/DELETE.
- **Centralised field/enum definitions** (`masterData.js`, builders) so a notified
  schema change touches one file, not the whole app.

---

## Running it locally

**Prerequisites:** Node.js and PostgreSQL installed; a database created and
`server/.env` configured (see [Environment variables](#environment-variables)).

```bash
# 1. install
cd server && npm install
cd ../client && npm install

# 2. database
cd ../server
npm run migrate     # applies schema.sql + gst-schema.sql
npm run seed        # demo users + sample data
npm run gst:seed    # GST master/reference data

# 3. run (two terminals)
npm start                       # API + serves built UI on http://localhost:4000
cd ../client && npm run dev     # OR Vite dev server on http://localhost:5173 (proxies /api)
```

**One-click desktop launch (Windows):** double-click **`Start ARRAYS ERP.bat`** at
the repo root. It starts the server hidden, waits until it's ready, and opens the
app in a clean Chrome/Edge app window (`http://localhost:4000`). PostgreSQL runs as
a Windows service and starts automatically.

**Default logins** (change these before go-live):

| Role | ID | Password |
|---|---|---|
| Editor (super-admin) | `editor` | `editor@123` |
| Admin | `admin` | `admin@123` |
| Operator | `operator` | `operator@123` |

---

## Roles & permissions

| Role | Purpose | Can |
|---|---|---|
| **Operator** | Daily data entry (local) | Create/edit/validate/print/export; imports & uploads; **maker** |
| **Admin** | Cloud-facing review | View + export everything; submit/cancel (checker); **no heavy imports** (keeps the free cloud fast) |
| **Auditor** | Statutory / internal audit | **Read-only** — view, PDFs, exports. No edit/submit/cancel/config (amber "AUDIT MODE" banner) |
| **Editor** | Protected super-user | Everything, plus data tools |

**Maker-checker:** the person who *prepares* a document is not the one who
*submits or cancels* it. Submission and cancellation require a checker (Admin).

GST permissions: `gst.view / create / edit / validate / submit / cancel / approve /
print / download / export / archive / admin`.

---

## The financial ERP

- **Payments / Receipts** — upload a proof; OCR extracts amount, date, reference,
  beneficiary; verify, classify (vendor/employee/client, project/site, category),
  add a mandatory note; the ledger posts automatically. Click any row for full detail.
- **Ledgers** — vendor, client and employee statements; outstanding logic correct
  (received-without-invoice never shows as outstanding).
- **Bank reconciliation** — upload IDBI statement (PDF/Excel/CSV); transactions are
  parsed and auto-matched to recorded payments/receipts; review the rest.
- **Reports & exports** — Excel + PDF, with date-range / financial-year presets.

The ERP ledger flow (receivables → receipts → ledger) is **independent** of the GST
workspace; cross-links exist but the two are never entangled.

---

## The GST compliance suite

Open **GST Compliance** in the sidebar. Highlights:

**Workspace (two columns):** e-Invoices on one side, E-Way Bills on the other.
- *e-Invoice:* New → fill Document / Seller / Buyer / Items / Values blocks (buyer
  GSTIN has an inline **Check**), Validate → **Submit → IRN**, download **PDF** /
  **signed JSON**, cancel lawfully (2-step verified).
- *e-Way Bill:* generate from an invoice or directly; Part A/B; generate, update
  Part B, extend, close, cancel (2-step verified).
- Blank document numbers are **auto-numbered** from the matching series
  (e.g. `HO/26-27/000001`).

**Control room**
- **Reconciliation Center** — 10 live cross-checks (drafts not submitted, failed IRN,
  IRN without EWB, EWB on a cancelled invoice, transport missing, duplicates, …)
  with resolve / ignore / override (audited) and jump-to-source.
- **Alerts** — expiring/expired EWB, IRN failures, stale drafts, pending approvals,
  duplicate numbers; severity + suggested action; unread→read→ack→resolved.
- **Activity Timeline** — one searchable, exportable stream across audit + access +
  API logs.
- **API Health** — connectivity, success ratio, last success/failure, error
  distribution, response trend.

**Admin**
- **Branches & GSTINs** — multiple registrations; each document is stamped with its
  branch; a branch switcher filters dashboards/lists.
- **Number Series** — FY-aware, branch-aware token templates `{BRANCH}/{FY}/{SEQ}`.
- **Scheduled Reports**, **Import Wizard** (CSV/JSON with row validation),
  **Backup & Recovery**, **Diagnostics**, **Production Readiness**.

**Reports:** GST summary, HSN summary, customer-wise tax, state-wise tax,
IRN success/failure, EWB validity, cancelled documents, audit activity — each
exportable to Excel/CSV/JSON.

---

## Security & governance

- **2-step security verification** for legally sensitive actions (cancel IRN/EWB,
  restore backup): **password re-authentication → email code**. Includes code
  expiry, resend cooldown, max retries, temporary lockout, and IP/device capture.
  Every attempt (success or failure) is written to the **immutable** audit log.
  (The app runs locally with no mail server, so the code is shown on screen.)
- **Immutable audit + API logs** — append-only at the database level.
- **Document attachments** with a compliance-critical "lock" (cannot be deleted).
- **Customer GST validation** and **duplicate-prevention** (exact document-number
  clash is blocked unless overridden with a reason).
- **Read-only Auditor mode** and a strict **view-only Admin** for evidence-only review.
- **Status banner** always visible (green *Live — offline filing*).
- **Diagnostics** + **Production-readiness review** assess every subsystem.

---

## GST filing — the offline workflow

There is **no live IRP API**; filing is done **offline** through the government
portal, in five steps (see the in-app **Help & Guide → “e-Invoicing step by
step”** for the full walkthrough):

1. **Build** the e-Invoice (or e-Way Bill) here — validated against the NIC schema.
2. **Download** the Portal JSON (single) or **Bulk JSON** (all pending).
3. Click **Upload on GST Portal**, log in, and bulk-upload the file.
4. The portal returns the **IRN, Ack number and a signed PDF**.
5. Back here, **Enter IRN → Scan signed PDF** — the IRN, Ack number and QR are
   read automatically and the finished, branded document is produced.

A pluggable IRP/EWB adapter (`server/src/services/gst/adapter.js`) and `GST_MODE`
remain in the codebase, so a real GSP/ASP channel can be wired in later without a
database redesign or workflow change — but it is **not required** to operate.

---

## Environment variables

`server/.env` (see `server/.env.example`):

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `4000` |
| `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` | PostgreSQL connection | — |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | auth | — / `7d` |
| `CLOUD_DATABASE_URL` | Neon URL for "Publish to Cloud" | — |
| `GST_MODE` | `simulation` \| `live` | `simulation` |
| `GST_MAKER_CHECKER` | enforce maker-checker | `on` |
| `GST_DUP_MODE` | duplicate handling `warn` \| `block` | `warn` |
| `GST_REQUIRE_OTP` | require 2-step verification | `on` |
| `GST_OTP_TTL_MIN` / `GST_OTP_COOLDOWN_SEC` / `GST_OTP_MAX_ATTEMPTS` | verification tuning | `5` / `30` / `5` |
| `GST_EWB_EXPIRY_HOURS` / `GST_DRAFT_STALE_DAYS` | alert thresholds | `24` / `3` |
| `GST_SMTP_HOST` | email channel (live) | — |

---

## Local-first + Publish to Cloud

The operator works **entirely locally** (local Postgres + local files), which keeps
everything fast and private. When ready, **Data Management → Publish to Cloud Now**
copies the **data only** (not the heavy files) to a cloud Neon database so the admin
can review everything on the web. Run as often as you like; each publish refreshes
the cloud copy. (CLI equivalent: `cd server && npm run sync`.)

---

## Verification & test suites

```bash
cd server
node scripts/gst-smoke.mjs          # validation engine, builders, adapter (offline)
node scripts/gst-http-smoke.mjs     # full e-Invoice/EWB lifecycle over HTTP
node scripts/verify.mjs             # end-to-end ERP verification (resets the DB)
```

In the app (admin): **GST Compliance → Diagnostics** (subsystem health + soft-launch
test suite) and **Production Readiness** (pre-deployment review with
pass/warn/fail + recommendations, exportable).

---

## Project layout

```
epc/
├── client/                 React SPA
│   └── src/
│       ├── pages/          screens (ERP + Gst*.jsx)
│       ├── components/     UI kit, layout, gst/ widgets
│       ├── context/        Auth, Branch, I18n (EN/HI)
│       └── lib/            api client, helpers, i18n dictionary
├── server/
│   └── src/
│       ├── routes/         REST endpoints
│       ├── services/gst/   compliance engine (adapter, validation, builders,
│       │                   einvoice/ewb services, recon, notify, monitor,
│       │                   branches, series, attachments, otp, backup, …)
│       └── db/             schema.sql, gst-schema.sql, migrate, seed
├── Start ARRAYS ERP.bat    one-click desktop launcher
└── README.md
```

---

## Documentation

| Document | For |
|---|---|
| [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) | Administrators — users, branches, series, integrations, branding, backup, maintenance |
| [`docs/DEVELOPER.md`](docs/DEVELOPER.md) | Developers — project structure, architecture layers, services, API, engines, DB |
| [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md) | Error-code reference (AUTH/SEC/EINV/EWB/PDF/IMPORT/BACKUP/GST) with cause + fix |
| [`docs/PRODUCTION_READINESS_REPORT.md`](docs/PRODUCTION_READINESS_REPORT.md) | Security/compliance/performance/PDF/DR/UAT reports + deployment checklist + verdict |
| In-app **Help & Guide** | End users — getting started, GST terms, step-by-step workflows, troubleshooting (bilingual EN/हिं) |

To load a ready-to-demo dataset: `cd server && npm run gst:demo` (branches, customers,
e-invoices across statuses, e-way bills, comments, versions, saved views, a verified backup
and demo branding — the system looks actively used).

---

### Bilingual UI
The entire interface switches between **English and Hindi** instantly from the
top-bar toggle (EN / हिं), and the choice is remembered — so language is never a
barrier for the operator.

---

© ARRAYS INGENIERIA PRIVATE LIMITED. Built by Siddhant Kumar.
