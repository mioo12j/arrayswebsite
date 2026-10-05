# ARRAYS ERP — Developer Handbook

**Audience:** the next engineer or AI assistant who opens this repository with zero prior context.
**Goal:** after reading this you should understand *what this software is, who uses it, what every single file does, how each subsystem works internally, and how to change it safely* — without reverse-engineering 29,000 lines first.

**Companion docs:** `SYSTEM-GUIDE.md` (plain-language overview for non-programmers) · `FUNCTIONAL-ISSUES.md` (ranked known logic bugs) · `docs/ADMIN_GUIDE.md` · `docs/ERROR_CODES.md` · **`docs/REBRANDING-GUIDE.md`** (turn this ERP into another company's — every place the name/logo/colours/bank live).
Where any of those disagree with this file, **this file is newer** — but verify against the code before trusting either.

---

## Table of contents

1. [The business this software runs](#1-the-business-this-software-runs)
2. [Roles and permissions](#2-roles-and-permissions)
3. [Running it locally](#3-running-it-locally)
4. [Architecture and request lifecycle](#4-architecture-and-request-lifecycle)
5. [Complete file-by-file map](#5-complete-file-by-file-map)
6. [The core domain model](#6-the-core-domain-model)
7. [Module deep-dive](#7-module-deep-dive)
8. [The document engine (PDF) — in depth](#8-the-document-engine-pdf--in-depth)
9. [The database](#9-the-database)
10. [Frontend architecture](#10-frontend-architecture)
11. [Cross-cutting concerns](#11-cross-cutting-concerns)
12. [Operational runbook](#12-operational-runbook)
13. [Gotchas that will bite you](#13-gotchas-that-will-bite-you)
14. [Known issues and tech debt](#14-known-issues-and-tech-debt)
15. [Glossary](#15-glossary)

---

## 1. The business this software runs

### 1.1 The company

**Arrays Ingenieria Private Limited (AIPL)** is an Indian **Solar EPC contractor**. EPC = *Engineering, Procurement, Construction*: the company designs a solar power plant, procures the equipment, builds it on the client's site, connects it to the grid, and maintains it.

Veteran-led (CEO **Lt. Gen. A.R. Prasad, Retd**). Two lines of work:

- **Solar EPC** — rooftop and ground-mount plants (residential, commercial, industrial, PSU/government).
- **Civil & allied works** — piling, foundations, tensile structures, earthing, fencing — often as subcontractor to larger EPC firms (e.g. Tata Power Solar).

Clients on record: Tata Power, Tata Steel, Tata Motors, Bharat Petroleum, DCM, Super Smelters, Jayshree Tea, Manjushree, YIAPL, TCPL (Tata Consumer).

### 1.2 Why the software exists

An **in-house ERP** replacing spreadsheets. **Single-operator, local-first**: it runs on the company's own Windows machine against local PostgreSQL, with an optional push to a cloud database (Neon) so a second machine can read the same data.

Four jobs:

| Job | In practice |
|---|---|
| **Money tracking** | Every rupee in/out, matched to the bank statement, attributed to vendor/client/project. |
| **Statutory compliance** | GST e-invoices (IRN/QR), e-way bills, Rule 55 delivery challans, GSTR reconciliation. |
| **Sales documents** | Client-facing proposal + commercial quotation + BOQ as premium PDFs. |
| **Records & recovery** | Audit log, soft-delete with restore, automatic backups, document vault. |

### 1.3 A project's life

```
Lead → Quotation (proposal + commercial quote + BOQ PDF)
     → Client accepts → Project created (PO number, contract value, milestones)
     → Purchases: payments to vendors (materials, labour, transport)
     → Billing: invoices raised on the client (proforma → tax invoice)
     → Client pays: receipts recorded, invoice status auto-updates
     → Monthly: bank statement imported, every line matched
     → GST: e-invoice IRN, e-way bill for transport, challan for site delivery
     → Reports: project profitability, receivable aging, vendor spend
```

Every module in the codebase serves one of those steps.

### 1.4 Non-negotiable business rules

These are *product* rules, not code preferences. Violating them produces documents that are commercially or legally wrong:

1. **Never invent commercial facts in a client-facing document.** No invented brands, capacities, or project claims. A previously-listed "300 MW SECI solar park" was fictitious and had to be purged from the entire proposal; YIAPL was civil & tensile work, not a solar park.
2. **The operator's margin is never shown to the client.** It is folded into BOQ item rates. It is visible only inside the app.
3. **The quotation signature block is the *client's* acceptance**, not the company's.
4. **No module/inverter brand fields.** The company supplies to client requirement; the quotation states *type* ("545 Wp Mono PERC / latest equivalent technology"), never a brand.
5. **Payment is credited only against a Proforma Invoice**; no GST tax invoice is issued until payment is received.

---

## 2. Roles and permissions

The `user_role` enum has four values (`admin`, `operator`, `editor`, `auditor`) but **two accounts matter**:

| Role | Who | Can do |
|---|---|---|
| **`editor`** | The owner/operator — **the super-admin** | Everything: create, edit, delete, import, export, data tools, user management |
| **`admin`** | Oversight — **view-only by design** | See everything; **cannot** write, import, or download/export |

`operator` and `auditor` exist for future use.

### 2.1 Enforcement — `server/src/middleware/rbac.js`

```js
requireRole(...roles)   // generic factory
adminOnly               // = requireRole('admin','editor')
editorOnly              // = requireRole('editor')
noImportForAdmin        // blocks admin on upload/OCR/import endpoints
denyExportForAdmin      // blocks admin on download/export endpoints
denyWriteForAdmin       // blocks admin on any non-GET for a whole router
```

Frontend mirrors this (`<Protected editorOnly>` in `App.jsx`, `blockExportForAdmin()` in `api/client.js`) — **UX only. The server guard is the real one.**

### 2.2 Authentication

JWT bearer tokens. `utils/token.js` signs; `middleware/auth.js` verifies and sets `req.user = { id, role, name, email }`. Token in `localStorage.epc_token`, user in `localStorage.epc_user`.

**The login field is `email`, but seeded values are bare words:**

```
editor / editor@123    (super-admin, is_protected = true)
admin  / admin@123     (view-only)
```

Seeded by `server/src/db/seed.js`. **Default development credentials — change before any real deployment.**

`middleware/auth.js` additionally enforces two global modes read from `app_config`:
- **maintenance** — only admin/editor pass
- **readonly** — only editor may use mutating methods

---

## 3. Running it locally

### 3.1 Prerequisites

Node.js 18+ (developed on 24), PostgreSQL, Windows (only the launcher scripts are Windows-specific).

### 3.2 First-time setup

```bash
npm run install:all
```

Create `server/.env` from `server/.env.example`. **`server/.env` is git-ignored and per-machine — never commit it.**

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 4000) |
| `NODE_ENV` | `development` / `production` |
| `CLIENT_ORIGIN` | CORS origin for the Vite dev server (`http://localhost:5173`) |
| `PGHOST` `PGPORT` `PGDATABASE` `PGUSER` `PGPASSWORD` | Local PostgreSQL |
| `DATABASE_URL` | Alternative to PG* (SSL auto-enabled) — use when the app itself runs against a cloud DB |
| `CLOUD_DATABASE_URL` | Neon target for "Publish to Cloud". Unset = local-only |
| `JWT_SECRET` | **Change this.** Long random string |
| `JWT_EXPIRES_IN` | Token lifetime (`7d`) |
| `UPLOAD_DIR` `MAX_UPLOAD_MB` | Proof/statement storage (default `uploads`, 25 MB) |

```bash
npm run db:migrate     # applies schema.sql + gst-schema.sql
npm run db:seed        # creates editor/admin users
npm run build          # builds React into client/dist
npm start              # server on :4000, serving client/dist
```

Open **http://localhost:4000**.

### 3.3 Development

```bash
npm run dev:server     # nodemon
npm run dev:client     # vite on :5173, proxying API to :4000
```

Operator launcher: **`Start ARRAYS ERP.bat`** → `start-arrays.ps1` — installs deps and builds the client if missing, starts the server only if port 4000 is free, opens a chromeless browser window so it feels like a desktop app.

### 3.4 Server scripts

| Script | Does |
|---|---|
| `npm run migrate` | Apply both schema files (idempotent) |
| `npm run seed` | Upsert editor/admin users |
| `npm run gst:seed` / `gst:demo` | GST master data / demo records |
| `npm run clear` | Wipe transactional data |
| `npm run reset-production` | Reset to clean production state |
| `npm run import-company` | Import company master data |
| `npm run sync` | Publish local DB → `CLOUD_DATABASE_URL` |

---

## 4. Architecture and request lifecycle

### 4.1 Three layers

| Layer | Location | Stack |
|---|---|---|
| **Client** | `client/` | React 18, Vite, Tailwind, React Router, axios, Recharts, Framer Motion, lucide-react, jsqr |
| **Server** | `server/src/` | Node ESM, Express, `pg`, pdfkit, tesseract.js, pdfjs-dist, exceljs, xlsx, multer, zod, bcryptjs, jsonwebtoken, qrcode, adm-zip, morgan |
| **Database** | PostgreSQL | `schema.sql` + `gst-schema.sql` |

In production the **server serves the built client** from `client/dist` on port 4000 — one origin.

### 4.2 Request lifecycle

```
Browser (axios — client/src/api/client.js)
  → Authorization: Bearer <epc_token>
    x-gst-branch: <id>            (from localStorage 'gst_branch', unless 'all')
  → Express (server/src/index.js)
      → morgan                     request logging
      → autoSyncOnWrite            mounted on /api — schedules debounced cloud publish after writes
      → authenticate               JWT → req.user; maintenance/readonly gates
      → rbac guard                 adminOnly / editorOnly / denyWriteForAdmin / noImportForAdmin
      → route handler              routes/*.routes.js, wrapped in asyncHandler
          → service layer          services/*.js — business logic + SQL
          → audit(req, {...})      writes audit_logs
      → error middleware           middleware/error.js → { error, detail }
```

**Conventions:** every async handler wrapped in `asyncHandler`; errors thrown as `new ApiError(status, message)`; routes thin, logic in services.

### 4.3 Route mounts (`server/src/index.js`)

```
/api/auth   /api/users    /api/projects  /api/sites     /api/vendors  /api/employees
/api/clients /api/own-accounts /api/categories /api/payments /api/receipts
/api/invoices /api/reconciliation /api/dashboard /api/reports /api/documents
/api/audit  /api/quotes   /api/company   /api/system    /api/gst
```

### 4.4 Background schedulers (started in `index.js`)

| Job | Cadence | File |
|---|---|---|
| **proof-archive** | daily | `services/proofArchiver.js` — zips proof/statement files >30 days into monthly archives; still readable transparently |
| **auto-backup** | every 2h, keep 30 | `services/gst/autoBackup.js` |
| **recovery-purge** | daily | `services/gst/recoveryPurge.js` — hard-deletes soft-deleted rows >30 days |
| **auto-sync** | debounced after writes | `services/autoSync.js` |

`index.js` also installs **process guards** so a bad upload or failed publish cannot kill the server.

---

## 5. Complete file-by-file map

### 5.1 Repository root

| File | Purpose |
|---|---|
| `package.json` | Workspace scripts (`install:all`, `db:migrate`, `db:seed`, `build`, `start`, `dev:*`) |
| `README.md` | Product overview and quick start |
| `SETUP.md` | Detailed installation |
| `DEPLOY.md` | Deployment notes |
| `SYSTEM-GUIDE.md` | Plain-language system explanation (non-programmers) |
| `FUNCTIONAL-ISSUES.md` | **Ranked list of known logic bugs — read before touching money logic** |
| `Start ARRAYS ERP.bat` / `start-arrays.ps1` | One-click operator launcher |
| `eng.traineddata` | Tesseract English OCR model |
| `netlify.toml` / `render.yaml` / `wrangler.jsonc` | Deploy configs for various hosts (largely vestigial — the product is local-first) |
| `docs/` | This handbook + admin guide, error codes, review reports |

### 5.2 `server/src/config/`

| File | Purpose |
|---|---|
| `db.js` | **The `pg` Pool.** Exports `query(text, params)`, `withTransaction(fn)`, `pool`. Chooses `DATABASE_URL` (SSL) or the `PG*` vars. Every DB call in the app goes through here |
| `env.js` | Loads and validates `.env` |
| `company.js` | Company identity constants used in documents/exports |

### 5.3 `server/src/middleware/`

| File | Purpose |
|---|---|
| `auth.js` | JWT verification → `req.user`; enforces maintenance and readonly modes |
| `rbac.js` | The five role guards (§2.1) |
| `audit.js` | `audit(req, { action, entity, entityId })` → writes `audit_logs` |
| `error.js` | Central error handler → `{ error, detail }` with the right HTTP status |
| `upload.js` | multer config — destination `UPLOAD_DIR`, size cap `MAX_UPLOAD_MB` |

### 5.4 `server/src/utils/`

| File | Purpose |
|---|---|
| `asyncHandler.js` | `asyncHandler(fn)` wrapper **and** the `ApiError` class |
| `token.js` | `signToken()` / `verifyToken()` |

### 5.5 `server/src/routes/` — the HTTP layer

Each file is thin: validate → call service → audit → respond.

| File | L | Endpoints (relative to its mount) |
|---|---|---|
| `auth.routes.js` | 84 | `POST /login` · `GET /me` · `POST /change-password` · `POST /verify-password` |
| `users.routes.js` | 96 | `GET /` · `POST /` · `PATCH /:id` · `POST /:id/reset-password` — editor-only; `is_protected` users can't be demoted |
| `company.routes.js` | 9 | `GET /` — company identity for the UI |
| `categories.routes.js` | 31 | `GET /` · `POST /` — expense categories |
| `projects.routes.js` | 240 | `GET /` · `GET /:id` · `POST /` · `PATCH /:id` · `DELETE /:id` · `POST /:id/restore` · `GET|POST /:id/sites` · `GET|POST /:id/payment-terms` · `PATCH|DELETE /payment-terms/:termId` |
| `sites.routes.js` | 56 | `GET /` · `PATCH /:id` · `DELETE /:id` |
| `vendors.routes.js` | 262 | `GET /` · `GET /:id` · `POST /` · `PATCH /:id` · `GET /:id/ledger` · `GET /:id/duplicates` · `POST /:id/merge` · `POST /:id/accounts` · `POST /import` |
| `clients.routes.js` | 161 | `GET /` · `POST /` · `PATCH /:id` · `GET /:id/ledger` · `GET /:id/duplicates` · `POST /:id/merge` |
| `employees.routes.js` | 88 | `GET /` · `POST /` · `PATCH /:id` · `GET /:id/ledger` |
| `ownAccounts.routes.js` | 97 | `GET /` · `POST /` · `PATCH /:id` · `DELETE /:id` · **`POST /reclassify`** (re-scan historical rows for internal transfers) |
| `payments.routes.js` | 323 | **`POST /extract`** (OCR) · `POST /` · `GET /` · `GET /:id` · `PATCH /:id` · `DELETE /:id` · `POST /:id/restore` · `POST /:id/invoice` · `GET|PUT /:id/allocations` |
| `receipts.routes.js` | 219 | `POST /extract` · `POST /` · `GET /` · `PATCH /:id` · `DELETE /:id` · `POST /:id/restore` · `GET|PUT /:id/allocations` |
| `invoices.routes.js` | 319 | `GET /unified` · `POST /extract` · `GET /` · `GET /:id` · `POST /` · `PATCH /:id` · `POST /:id/document` · `DELETE /:id` · `POST /:id/restore` · **`GET /:id/pdf`** · `POST /:id/link-ewb` · `POST /:id/create-ewb` |
| `reconciliation.routes.js` | 554 | `POST /statements` (upload+parse+match) · `GET /statements` · `GET /statements/:id` · `DELETE /statements/:id` · **`POST /statements/:id/import-missing`** · `POST /lines/:id/resolve` · `POST /lines/:id/ignore` · `GET /summary` · `GET /health-all` · `GET /statements/:id/health` |
| `quotes.routes.js` | 356 | See §7.7 — calculate, CRUD, revise/approve/convert, 6 PDF endpoints, soft-delete + restore |
| `dashboard.routes.js` | 212 | `GET /summary` · `/cashflow` · `/expense-by-category` · `/expense-by-project` · `/vendor-spend` · `/receivable-aging` · `/client-revenue` · `/recent` · `/system-counters` · `/gst` |
| `reports.routes.js` | 367 | `GET /payments` · `/receipts` · `/invoices` · `/projects` · `/vendor-ledger/:id` · `/client-ledger/:id` · `/employee-ledger/:id` · `/reconciliation/:id` · `/allocations/incoming` · `/allocations/outgoing` — all stream Excel/PDF via `export.service.js` |
| `documents.routes.js` | 49 | `GET /:id` · **`GET /:id/file`** — authenticated blob streaming (transparently reads archived zips) |
| `audit.routes.js` | 30 | `GET /` — filterable audit trail |
| `system.routes.js` | 109 | `POST /clear-data` · `POST /seed-demo` · `GET /cloud-status` · `POST /sync-to-cloud` · `GET /export-data` · `POST /flush-on-exit` · `GET /update/status` · `POST /update/apply` |
| `gst.routes.js` | 692 | ~60 endpoints — branches, number series, permissions, maintenance, integrations, master data, dashboard, reports, audit, recon, notifications, health, activity, e-invoices, e-way bills, challans, backups, imports, comments, saved views, schedules |

### 5.6 `server/src/services/` — business logic

| File | L | What it does |
|---|---|---|
| `ledger.service.js` | 78 | **The automation core.** `postLedgerEntry`, `removeLedgerForSource`, `refreshInvoiceStatus` (§6.1) |
| `paymentService.js` | 66 | `findOrCreateEmployee`, `postPaymentLedger`, `softDelete`, `restore` |
| `receiptService.js` | 62 | `postReceiptLedger`, `postRefundLedger`, `postForKind`, `softDelete`, `restore` |
| `invoiceService.js` | 133 | `computeInvoiceTotals`, `sellerStateFor` (CGST/SGST vs IGST), `writeItems`, `items`, `softDelete`, `restore`, `listUnified` |
| `allocationService.js` | 68 | Get/set payment and receipt allocations across projects/sites |
| `ownAccountsService.js` | 107 | Own-account matching: `accountDigits`, `normalizeHolder`, `loadOwnAccountMatchers`, `matchesOwnAccount`, `isOwnAccount`, CRUD |
| `reconciliation.service.js` | 355 | `parseStatement`, `parseIdbiTabular`, `parseIdbiBlocks`, `matchLine` |
| `narration.service.js` | 109 | `parseNarration` (bank narration → mode/ref/account/beneficiary), `reconstructName`, `modeToEnum` |
| `vendor-match.service.js` | 141 | `normalizeName`, `findVendorByAccount`, `findVendorByName`, `autoMapVendor`, `findOrCreateVendor`, `findOrCreateClient`, `autoMapClient` |
| `vendor-import.service.js` | 91 | `parseVendorFile` — bulk vendor import from Excel/CSV |
| `ocr.service.js` | 317 | `extractText` (tesseract for images, pdfjs for PDFs), `parsePaymentFields`, `parseReceiptFields`, `parseInvoiceFields` |
| `document.service.js` | 49 | `saveDocument`, `getDocument` — proof storage metadata |
| `proofArchiver.js` | 85 | `runProofArchive`, `readArchivedBuffer`, `startProofArchive` — 30-day zip archiving |
| `export.service.js` | 291 | `streamExcel`, `streamPdf` — generic report exporters |
| `invoice-pdf.js` | 331 | `invoicePdf` — running-account invoice + measurement sheet |
| `quote-calc.service.js` | 191 | `calculateQuote` — the estimation engine (§7.7) |
| `quote-docs.service.js` | 634 | `renderQuotation`, `renderBOQ`, `renderScope` (§8.4–8.6) |
| `proposal-pdf.service.js` | 1779 | The 22-page proposal book + `KIT` shared helpers (§8) |
| `quote-pdf.service.js` | 527 | `streamQuotePdf` — older single-file quote PDF (legacy path) |
| `pdf-i18n.js` | 121 | `applyPdfLang`, `translateLabel`, Devanagari font constants — bilingual EN/हिन्दी downloads |
| `sync.service.js` | 210 | Local → cloud full-overwrite mirroring, FK-ordered, enum-drift self-healing |
| `autoSync.js` | 78 | `cloudConfigured`, `runSyncNow`, `scheduleAutoSync`, `autoSyncStatus`, `autoSyncOnWrite` |
| `system.service.js` | 181 | `clearAllData`, `seedDemo` |
| `updateService.js` | 61 | `getStatus`, `startSelfUpdate` — git-based self-update |

### 5.7 `server/src/services/gst/` — the compliance subsystem

| File | L | What it does |
|---|---|---|
| `einvoiceService.js` | 427 | E-invoice lifecycle (IRN generate/cancel/status) |
| `einvoiceBuilder.js` | 155 | Builds the notified **schema v1.1** JSON payload |
| `ewbService.js` | 392 | E-way bill lifecycle |
| `ewbBuilder.js` | 97 | Maps internal records → EWB generate payload |
| `adapter.js` | 168 | **Pluggable IRP / EWB adapter** — swap the government API provider here |
| `challanService.js` | 416 | Delivery challan lifecycle (Rule 55 — movement of goods without sale) |
| `challan-pdf.js` | 211 | Branded A4 challan PDF with QR |
| `backupService.js` | 413 | Full-system backup, verification, DR test, preview-restore |
| `autoBackup.js` | 44 | Silent background backups (2h, keep 30) |
| `recoveryPurge.js` | 39 | Daily purge of soft-deleted rows >30 days |
| `validation.js` | 251 | Field/schema validation for compliance payloads |
| `masterData.js` | 184 | GST master/reference data (states, HSN, rates) |
| `reportService.js` | 182 | GSTR-style compliance reports |
| `reconService.js` | 154 | GSTR reconciliation matching |
| `configService.js` | 145 | Maintenance mode + configuration export |
| `rollupService.js` | 139 | Aggregations for the GST dashboard |
| `seriesService.js` | 123 | Per-branch document number series |
| `notifyService.js` | 117 | Notification/alert generation |
| `monitorService.js` | 106 | API health monitoring + global activity timeline |
| `readinessService.js` | 103 | Production-readiness review checks |
| `otpService.js` | 97 | OTP challenges for sensitive actions |
| `branchService.js` | 90 | Multi-branch / multi-GSTIN |
| `brandingService.js` | 86 | Per-branch letterhead/branding |
| `versionService.js` | 83 | Record versioning |
| `log.js` | 82 | Immutable API log + audit timeline |
| `diagnosticsService.js` | 82 | Health check & diagnostics |
| `attachmentService.js` | 76 | Document attachments (compliance trail) |
| `permissions.js` | 73 | GST-specific permission resolution |
| `commentService.js` | 70 | Approval discussions/collaboration |
| `savedViewService.js` | 70 | Saved filters per user |
| `importService.js` | 70 | Data import wizard (server side) |
| `gstinValidationService.js` | 50 | Customer GSTIN validation |
| `exporter.js` | 47 | Rows → CSV/XLSX/JSON |
| `searchService.js` | 46 | Cross-entity search |
| `duplicateService.js` | 41 | Near-identical invoice detection |
| `feedService.js` | 38 | Human-readable business activity feed |
| `util.js` | 22 | Small shared helpers for the JSON builders |
| `pdf.js` | 563 | **Shared GST PDF house style** — used by challan/invoice PDFs |

### 5.8 `server/src/db/`

| File | Purpose |
|---|---|
| `schema.sql` | Core ERP schema (~23 tables, views, enums, triggers) — idempotent |
| `gst-schema.sql` | GST + challans + allocations + own accounts (~30 tables) — idempotent |
| `migrate.js` | Applies both files. **Adds enum values *before* the schema** (enums can't change inside a transaction) |
| `seed.js` | Upserts the editor/admin users |
| `gst-seed.js` / `gst-demo.js` | GST master data / demo records |
| `clear-data.js` | Wipes transactional data, keeps masters |
| `reset-production.js` | Clean production reset |
| `import-company.js` | Company master import |
| `sync-to-cloud.js` | CLI wrapper around `sync.service.js` |

### 5.9 `server/src/assets/` — **all PDF assets live here**

Note the two **sibling** directories: fonts are *not* inside `brand/`.

```
assets/
├── fonts/                 ← FONT_DIR
│   Cormorant-SemiBold.ttf, Cormorant-Bold.ttf
│   EBGaramond-Regular/Medium/Italic.ttf
│   Inter-Regular/Medium/SemiBold/Bold.ttf
│   TeXGyreChorus.otf       (script/signature)
│   (Mukta — Devanagari, used by pdf-i18n.js for Hindi downloads)
└── brand/                 ← BRAND
    ├── logo-color.png, logo-white.png   cover, chrome header, thank-you plate
    ├── photos/   proj-*.jpg  — proj-seci, proj-tml, proj-dcm-hisar, proj-jayshree,
    │             proj-yiapl, proj-supersmelters, proj-manjushree, proj-appl,
    │             proj-earthing, proj-piling-extra, proj-inauguration, proj-rooftop-pano
    ├── press/    ceo-president, ceo-modi, ceo-rajnath, ceo-defcom
    ├── news/     news-bhaskar-tcpl, news-supersmelters-inaug, news-supersmelters-rooftop
    └── certs/    certification images
```

Path builders in `proposal-pdf.service.js`: `photo(n)` `press(n)` `cert(n)` `news(n)` — each appends `.jpg`, so pass the bare name.

### 5.10 `client/src/`

**`api/client.js`** — the axios instance. Attaches `Authorization` and `x-gst-branch`; exports `api`, `apiError(e)` (normalizes `{error,detail}`), `currentUser()`, `blockExportForAdmin()`, and `download(path)` (blob fetch with auth → filename from `Content-Disposition` → save dialog; also triggers the EN/हिन्दी language prompt for translatable documents).

**`lib/`**

| File | Purpose |
|---|---|
| `useFetch.js` | `{ data, loading, error, refetch, setData }` GET hook |
| `format.js` | `inr()`, `inr(x,{compact:true})`, `fmtDate`, `titleCase` |
| `gst.js` | GST helpers (GSTIN parsing, state codes, rate math) |
| `dateRange.js` | Date-range presets for filters |
| `pincode.js` | PIN → city/state lookup |
| `qrScan.js` | QR scanning (jsqr) for e-invoice/challan verification |
| `i18n-dict.js` / `langPrompt.js` | EN/हिन्दी dictionary and the download language chooser |
| `utils.js` | `cn()` class merging etc. |

**`components/`**

| Path | Purpose |
|---|---|
| `ui/index.jsx` | `Card`, `PageHeader`, `Spinner`, `Loading`, `EmptyState`, `Badge`, `DescList`, `DescRow`, `Field`, `Table` |
| `ui/Modal.jsx`, `ui/Toast.jsx` (`useToast()`), `ui/ProofView.jsx` | Dialog, toasts, authenticated proof viewer |
| `ui/button.jsx`, `input.jsx`, `label.jsx` | Radix-based primitives |
| `layout/` | App shell, sidebar, header, branch switcher |
| `gst/` | GST-specific widgets |
| `AllocationModal.jsx` | Split a payment/receipt across projects/sites |
| `UpdateNotice.jsx` | Self-update banner |

**`pages/` — one file per screen (44)**

| Page | L | Purpose |
|---|---|---|
| `Login.jsx` | 211 | Auth screen |
| `Dashboard.jsx` | 256 | "Financial Data AIPL" — KPIs, cashflow, charts |
| `Payments.jsx` | 549 | Outgoing payments: proof upload, OCR review, allocations |
| `Receipts.jsx` | 377 | Incoming receipts incl. TDS/retention/deductions |
| `Invoices.jsx` | 417 | Invoice list/editor, PDF, e-way bill linking |
| `Reconciliation.jsx` / `ReconciliationDetail.jsx` | 255 / 205 | Statement upload; per-line match/resolve |
| `Vendors.jsx` / `VendorLedger.jsx` | 206 / 138 | Vendor master, duplicates, merge; ledger |
| `Clients.jsx` / `ClientLedger.jsx` | 149 / 124 | Client master; ledger |
| `Employees.jsx` / `EmployeeLedger.jsx` | 96 / 67 | Employee master; ledger |
| `OwnAccounts.jsx` | 163 | Own bank accounts + re-scan |
| `Projects.jsx` / `ProjectDetail.jsx` | 135 / 299 | Projects & sites; milestones, rollups |
| `Quotes.jsx` | 122 | Quote list + **Trash / restore / purge** |
| `QuoteBuilder.jsx` | 709 | **The estimation + document builder** (§7.7) |
| `DeliveryChallans.jsx` | 406 | Rule 55 challans |
| `RecoveryCenter.jsx` | 118 | 30-day restore across entities |
| `Reports.jsx` | 44 | Report/export launcher |
| `System.jsx` | 197 | Data management, cloud publish, demo/clear |
| `Users.jsx` | 132 | User management |
| `Audit.jsx` | 55 | Audit log viewer |
| `Hubs.jsx` | 106 | Grouped landing pages (Reports / Activity / Status / Data Admin) |
| `About.jsx` / `Help.jsx` | 71 / 881 | Company info; in-app manual |
| `Gst*.jsx` (20 files) | — | Dashboard, Compliance (734L — the main workspace), Recon, Notifications, Activity, Health, Branches, Series, Import, Schedules, Backup, Diagnostics, Readiness, System, Branding, Integrations, Feed, Reports |

**`App.jsx`** — all routes with `<Protected editorOnly|adminOnly>` gating.

---

## 6. The core domain model

### 6.1 Everything is a ledger

**The single most important concept.** `ledger_entries` (`services/ledger.service.js`) is a double-sided party ledger. Parties: **vendor** (you pay), **client** (pays you), **employee**.

**Balances are never stored** — they are computed by views (`v_vendor_balances`, `v_client_balances`, `v_employee_balances`), so balances always reconcile with the documents behind them.

**Direction convention** (get this wrong and every number is wrong):

| Party | `debit` | `credit` |
|---|---|---|
| **Client** | You billed them — receivable ↑ | They paid you — receivable ↓ |
| **Vendor** | You paid them — payable ↓ | They billed you — payable ↑ |

**Edit/delete semantics:** never patch a balance. Call `removeLedgerForSource(db, sourceType, sourceId)` then re-post with `postLedgerEntry`. That is why deleting a payment correctly repairs a vendor balance.

```js
postLedgerEntry(db, { partyType, partyId, direction, amount, entryDate,
                      description, projectId, siteId, sourceType, sourceId, userId })
removeLedgerForSource(db, sourceType, sourceId)
refreshInvoiceStatus(db, invoiceId)   // → partially_paid / paid / overdue
```

`db` accepts a transaction client or the pool — **always pass the transaction client inside `withTransaction`.**

### 6.2 Allocation

One payment/receipt can span several projects. The split lives in `outgoing_payment_allocations` / `incoming_payment_allocations`, exposed via `v_outgoing_alloc` / `v_incoming_alloc`. **Amount, date, reference and party are locked after save** — only the split changes. Project rollups and expense-by-project read the allocation views.

### 6.3 Own accounts

`own_accounts` holds the company's *own* bank accounts. Money moving between them is **not** income or expense. `ownAccountsService.js` matches by account digits + normalized holder name; payments carry `transaction_type` (`expense` / `internal_transfer` / `financing`). A **Re-scan existing** button reclassifies history.

This exists because reconciliation originally assumed *every debit is an expense, every credit is income* — see `FUNCTIONAL-ISSUES.md` #1/#2.

---

## 7. Module deep-dive

### 7.1 Payments — money out
`routes/payments.routes.js` · `services/paymentService.js`, `allocationService.js` · `pages/Payments.jsx`

Two entry paths:
1. **Proof import** — `POST /payments/extract` runs OCR → reference/UTR, amount, date, beneficiary, account, network. Operator reviews → `POST /payments`.
2. **From reconciliation** — a statement debit becomes a payment.

On save: **mandatory operator comment**, **vendor auto-mapping**, **debit posted to the payee's ledger** (employee if flagged, else vendor). A **duplicate guard** blocks re-saving the same UTR (409 + explicit override).

### 7.2 Receipts — money in
`routes/receipts.routes.js` · `services/receiptService.js` · `pages/Receipts.jsx`

Requires a **client**. Posts a **credit for the full settled value**:

```
settled = cash credited + deductions + TDS + retention
```

because all of those reduce what the client still owes. Linked invoices refresh via `refreshInvoiceStatus`. `postRefundLedger` / `postForKind` handle non-income credits.

### 7.3 Invoices
`routes/invoices.routes.js` · `services/invoiceService.js`, `invoice-pdf.js` · `pages/Invoices.jsx`

Running-account format with auto-generated **measurement sheet** and editable letterhead. Types `proforma` / `tax`. `sellerStateFor()` decides **CGST+SGST vs IGST**. Statuses: `draft → raised/issued → sent → partially_paid → paid → overdue → closed` (+`cancelled`). Soft-deletable, recoverable, linkable to e-way bills.

### 7.4 Bank reconciliation
`routes/reconciliation.routes.js` · `services/reconciliation.service.js`, `narration.service.js`, `vendor-match.service.js`

1. **Upload** → `parseStatement`: IDBI tabular PDF (`parseIdbiTabular`), IDBI OpTransactionHistory (`parseIdbiBlocks`), or Excel/CSV column detection. Narrations parsed by `narration.service.js`.
2. **Auto-match** (`matchLine`): debit → existing payment, credit → existing receipt; by reference, else amount + date ±3 days. Result `matched` / `unmatched` / `duplicate`.
3. **Resolve**: `import-missing` (bulk), `lines/:id/resolve` (single, mandatory comment), `lines/:id/ignore`.

### 7.5 Party matching
`services/vendor-match.service.js`

| Function | Strategy |
|---|---|
| `findVendorByAccount` | Exact beneficiary account (`vendor_accounts`, `vendors.bank_account`), confidence 100 |
| `findVendorByName` | `pg_trgm` `similarity` + `word_similarity`, threshold **0.34** |
| `normalizeName` | Strips honorifics (MR/MRS/SHRI…), "S/O …" tails, bank tokens (NEFT/UPI/REF…) |
| `autoMapVendor` | Account first, then name |
| `findOrCreateVendor/Client` | Creates `is_candidate = true` party so reconciliation never stalls |

`vendor_accounts.account_number` is **globally unique** — that prevents duplicate vendors on re-import when the account is known.

### 7.6 OCR
`services/ocr.service.js` — `extractText` (tesseract.js for images, pdfjs-dist in-process for PDFs), plus heuristic parsers handling two-column screenshot bleed, wrapped names, UPI VPA/reference, largest-amount fallback, and **failed-transaction detection**. Beneficiary comes from "To Account", never "From Account".

### 7.7 Quotes, proposals and BOQ ⭐
`routes/quotes.routes.js` · `quote-calc.service.js`, `quote-docs.service.js`, `proposal-pdf.service.js` · `pages/Quotes.jsx`, `QuoteBuilder.jsx`

#### The estimation engine — `quote-calc.service.js`

`calculateQuote(input)`. **All work rates are ₹ per watt (₹/Wp)** — ₹4/W on 25 kWp = ₹4 × 25,000 = ₹1,00,000.

```
panel_wattage 545       panel_rate 11990 (₹/module)   panel_rate_per_watt 22 (₹/W)
extra_module_pct 0      inverter_rate 4.2             structure_rate 3.5
bos_rate 4              civil_rate (by type)          labour_rate 2.5
transport_rate 0.5      margin_pct 15                 gst_pct 13.8
tariff_per_kwh 8        generation_per_kw_year 1500   subsidy_amount 0
```

`CIVIL_BY_TYPE`: residential 0.5 · rooftop 0.6 · commercial/institutional 0.9 · government 1.0 · industrial 1.5 · ground_mount/utility 3.2.

**Scope of supply.** Three checkboxes gate what the quote actually covers: **Solar Panels Supply** (`panel`), **Inverter Supply** (`inverter`) and **I&C Work** (`inc` → the `labour` category). All default on; unchecking one removes that block from the rate assumptions (field greyed/disabled), the BOQ (its rate category can't be ticked and any existing use is dropped), the totals, and the quotation (its System-Config row and, for a supply-only quote, the offer wording). Passed to the calc as `input.scope` (`{ panel, inverter, inc }`, via `normalizeScope`), persisted in `proposal_inputs.scope_panel|scope_inverter|scope_inc`, and mirrored in the builder's `boqRows`. `outOfScope(cat, scope)` in the engine (and `scopeGated(cat)` in the UI) is the single gate. Verified invariant: an out-of-scope block appears in none of rates / BOQ / Live Estimate / PDF.

**Category-linked BOQ (the core model).** Every BOQ line carries **`categories: []`** — the rate-assumption buckets it draws its cost from — so the BOQ and the rate assumptions are always linked and the system never guesses the rate from the free-text description. A line may combine **several** categories (checkboxes in the UI): their per-watt rates **add up** (e.g. `structure` ₹3.5/W + `bos` ₹4/W = ₹7.5/W × system watts). Categories (`RATE_CATEGORIES`): `panel` (per-module) · `inverter` · `structure` · `bos` (cabling+earthing+BOS) · `civil` · `labour` (installation & commissioning) · `transport`. **No category ticked ⇒ manual** — the operator types the rate. `category` (singular, first of the array) is retained for back-compat and margin bucketing. The **description is free text** (what the client sees, wraps to multiple lines); the **categories** decide the rate. The builder shows the working per line (`₹X/W × watts`). When no `custom_items` are supplied the calc uses `defaultSpecs(type)`; otherwise it uses the operator's lines.

**Everything in the BOQ is BASIC (pre-GST).** `calculateQuote` returns **enriched** line items — each with `categories`/`category`, `cost_rate`, `cost_amount` (actuals), `margin_amount` (its folded share), `amount` (cost + margin), `rate` (final per unit). `allocateMargin(items, margin, distRaw)` folds the margin into the lines and returns `margin_distribution` (the realised per-bucket split, surfaced in the builder's "My Margin" card). Top-level: `subtotal` (basic actuals) → `margin_amount` → `taxable_amount` (basic price we quote on) → `gst_amount` → `total_amount`; plus **two per-watt figures**: `per_watt_basic` (`taxable/watts` — GST is a pass-through, so we quote/measure per-watt on this) and `per_watt` (`total/watts`, incl. GST). The quotation PDF and the Live Estimate both show both.

**Configurable margin distribution.** The split is operator-defined via `input.margin_dist` — an array of `{ key, pct }` where `key` is a rate category (`civil`, `labour`, `structure`, …) or `'other'` (everything not otherwise bucketed). `MARGIN_BUCKETS` is the exported bucket list; the default is `[{civil:40},{labour:40},{other:20}]` (the historic behaviour). Each line is assigned to **exactly one** bucket (first matching category in config order, else `other`); the **full margin is always distributed** across whichever configured buckets actually have lines (normalised over their pcts), so `taxable` is invariant to the split — only *where* the margin lands changes. Persisted in `proposal_inputs.margin_dist`.

**Builder UI.** The BOQ is a **full-width table below the grid**. Each row: a wrapping **Description** textarea (free client text), a **multi-select "Rate from"** checkbox group (rates add up; a category is disabled on other rows once used — one line per category), a no-spinner numeric **Qty** (fits 4 digits), **Unit**, and visible **Rate (assumed, with the `₹X/W × watts` working) → + Margin → Amount (basic)** columns, plus a **totals `tfoot`** (Subtotal / Margin / Total basic). The **Margin distribution** editor (tick buckets + set %) and the **Panel Rate Calculator** (₹/W × wattage → ₹/module) live in the Rate Assumptions card; the margin % is a rate field. To stay instant, the client recomputes rows client-side (`boqRows`) and the split (`marginDist`) mirroring the engine — **keep `RATE_DEFAULTS`, `CIVIL_BY_TYPE`, the bucket-assign logic and the default split in `QuoteBuilder.jsx` in sync with `quote-calc.service.js`.** Verified invariant: the BOQ amount-column sum, the BOQ total row, and the Live Estimate taxable are always equal. There is no standalone "Proposal Text" card — the Extra Technical Requirements / Notes field lives in the Commercial Terms panel (still `form.notes` → the PDF notes block).

**The margin rule (business-critical):**

```
subtotal = Σ line items          ← COST
margin   = subtotal × margin_pct
taxable  = subtotal + margin
gst      = taxable × gst_pct     (or an explicit gst_amount)
total    = taxable + gst
per_watt = total / (kW × 1000)
```

`clean()` keeps only numeric overrides from the payload — which is why the frontend can safely hold raw strings while typing.

Also computed: PM Surya Ghar residential subsidy (`min(78000, 30000×min(kw,2) + (kw>2 ? 18000 : 0))`), net cost, annual generation, annual savings, payback, 25-year savings, CO₂ offset.

#### Quote lifecycle

`quote_status`: `draft → sent → approved → rejected → revised → converted → expired`.

| Endpoint | Effect |
|---|---|
| `POST /quotes/calculate` | Live preview, no persistence — powers the builder |
| `POST /quotes` | Insert; auto-numbers `QT-<year>-<0001>` |
| `PATCH /quotes/:id` | Update + recalculate |
| `POST /:id/revise` | Copy to a new version; source marked `revised` |
| `POST /:id/approve` | `status='approved'`, records approver/time |
| `POST /:id/convert` | Creates a **project**, marks `converted` |
| `POST /:id/undo` | **Reverses approve/convert** → back to `draft`. Requires a `{ remark }` (why) recorded in the audit log. If it was converted, the auto-created project is soft-deleted to the Recovery Center — but only when it has no invoices/ledger/allocations yet; a project with activity is kept and merely unlinked |
| `DELETE /:id` | **Soft delete** → `deleted_at` (Trash) |
| `DELETE /:id?purge=1` | Permanent (only if already in Trash) |
| `POST /:id/restore` | Un-delete |
| `GET /?trash=1` | Trash listing |

#### Data merge for documents

`loadQuoteData(id)` merges in precedence order:

```js
{ ...q.inputs, ...q, ...q.proposal_inputs, ...office }
```

so operator fields (tariff, yield, system config, notes, scope) reach the PDF, with GSTIN/company/office joined from `gst_branches`.

`DOC_ORDER = ['proposal','quotation','boq']`; `streamParts(res, q, data, parts)` renders the requested parts into one pdfkit document.

### 7.8 GST subsystem
`routes/gst.routes.js` (~60 endpoints) + `services/gst/*` (39 files, §5.7) + ~20 `Gst*.jsx` pages. Self-contained; the government API provider is swappable via `adapter.js`.

### 7.9 Projects & sites
Projects: PO number/date, contract value, budget, status, soft-delete, **payment-terms milestones** (`project_payment_terms`, due vs released). Sites: PO details + capacity. Rollups use allocation views. `GET /projects/:id` also returns the **source `quote`** (found by `quotes.project_id`) with its `proposal_inputs`, priced `line_items` and financials + `per_watt_basic`, so the project page's **Quotation & Scope** card can show the agreed system config (incl. `module_supply`/`inverter_supply` — "supplied by us" vs "free-issue by client, I&C only"), the priced BOQ, and the ROI, with links to open the quote and download its documents.

### 7.10 Dashboard & reports
KPIs: `total_outgoing`, `total_incoming`, `net_position`, `pending_receivables`, `vendor_liabilities`, plus cashflow, expense-by-category/project, vendor spend, receivable aging, client revenue, recent feed. All exclude `is_deleted`.

> ⚠️ Headline numbers are only as correct as upstream classification. An internal transfer booked as a receipt inflates income directly.

### 7.11 Documents, proofs, vault
Proofs open through an **authenticated blob viewer** (a plain `<a href>` cannot send the JWT). Files >30 days are zipped monthly but still open transparently. `vault_documents` + `vault_document_versions` give versioned storage.

### 7.12 System, sync, backup, audit
**Publish to Cloud** — full overwrite to Neon, table by table, FK order, self-healing enum drift; debounced automatic publish after writes; sign-out flushes. **Audit log** on every mutation. **Recovery Center** — 30-day restore across invoices, e-invoices, e-way bills, challans, payments, receipts, projects.

---

## 8. The document engine (PDF) — in depth

Client-facing PDFs are the company's public face. This section explains the whole pipeline.

### 8.1 Stack and fonts

**pdfkit**, vector, embedded TTF/OTF from `server/src/assets/fonts/` (`FONT_DIR`). Registered by `registerFonts(doc)` in `proposal-pdf.service.js`:

| Alias | Font | Use | Fallback |
|---|---|---|---|
| `H` / `HB` | Cormorant SemiBold / Bold | Display headings | Times |
| `body` / `bodyM` / `bodyI` | EB Garamond Reg/Med/Italic | Running text | Times |
| `ui` / `uiM` / `uiSB` / `uiB` | Inter Reg/Med/SemiBold/Bold | Labels, data, tables | Helvetica |
| `script` | TeX Gyre Chorus | Signature flourish | — |

Each registration falls back to a core font if the file is missing — a missing font degrades, never crashes.

For Hindi downloads use **Mukta** (`pdf-i18n.js`). **Noto Devanagari crashes fontkit** — do not switch to it.

### 8.2 Brand system

`M = 44` (page margin). Palette `C`: emerald `#0a6045`, deep emerald `#07281d`, mid emerald, gold `#b8860b`, bright gold `#e7a719`, navy, sky, mint/mint2/cream/paper (tints), ink/body/mute (text), line (hairlines). Exported as `PROPOSAL_BRAND = { M, C }`.

### 8.3 `KIT` — the shared helper toolkit

`proposal-pdf.service.js` exports `KIT`, which `quote-docs.service.js` imports. **Always build new pages from these** so every document looks identical:

| Helper | Does |
|---|---|
| `chrome(doc, tag)` | Header (logo + centred tag + company name + gold rule) and dark footer band |
| `heading(doc, kicker, title)` | Gold eyebrow + Cormorant title + `triTick` underline |
| `para(doc, text, x, y, w, opts)` | Body paragraph with house leading |
| `panel(doc, x, y, w, h, fill, r, stroke)` | Rounded card |
| `eyebrow(doc, text, x, y, color)` | Small letter-spaced section label |
| `triTick(doc, x, y, w)` | The gold/emerald/sky triple underline |
| `drawImg(doc, file, x, y, w, h, r)` | Cover-fit image with rounded corners (crops, never distorts) |
| `logo(doc, x, y, w, white)` | Company mark |
| `statBand`, `iconChip`, `icon`, `bleed` | Stat strip, icon chips, full-bleed colour |
| `photo/press/cert/news(name)` | Path builders into `assets/brand/*` |
| `V(v, dash)`, `num(v, d)`, `inr(v)`, `inrShort(v)` | Value/number/currency formatting (`inrShort` → ₹12.06 L / ₹1.08 Cr) |
| `model(data)` | **The savings model** (§8.4) |
| `addressLines`, `titleCaseCover` | Address splitting, cover title casing |

### 8.4 `model(data)` — the single source of savings truth

Both the proposal and the quotation call this, so their numbers always agree.

```js
kwp        = capacity (fallback 100)
tariff     = data.tariff ?? tariff_per_kwh ?? inputs.tariff_per_kwh ?? 8.5   (₹/kWh)
yield      = generation_per_kw_year ?? inputs... ?? 1500                      (kWh/kWp/yr)
gen1       = kwp × yield                       year-1 units
capex      = total_amount ?? net_cost, else kwp × cost_per_kwp(48000)
subsidy    = subsidy_amount ?? subsidyFor(...)
netInvest  = net_cost ?? max(capex − subsidy, 0)
save1      = annual_savings ?? gen1 × tariff
25-yr loop: escalation ×1.035/yr, degradation ×0.994/yr → series[25], cum25
payback    = payback_years ?? netInvest / save1
roiX       = cum25 / netInvest
co2        = gen × 0.82 kg/kWh;  trees = co2kg / 22
```

**It prefers real quotation figures when present** — that is why the proposal's ROI matches the quotation's total.

### 8.5 `renderQuotation(doc, data, opts)` — page by page

*File:* `quote-docs.service.js` L148–342. Signature note: `opts.shared` means "you are being appended to an existing document" — fonts and margins are then already set up. When standalone it calls `registerFonts(doc)`, sets `page.margins.bottom = 0` and re-applies that on every `pageAdded` (otherwise pdfkit auto-breaks mid-panel).

Two locals drive everything:
- `c = commercials(data)` — resilient figures: `{ items, subtotal, contingency, margin, taxable, gst, total, subsidy, net, kwp, perW }`, each falling back to a computation when the column is empty.
- `hw = hardware(c.items)` — regex-sniffs module/inverter/structure descriptions out of the BOQ (legacy helper).

#### PAGE 1 — Priced Offer

| Block | Detail |
|---|---|
| `chrome` + `heading('Priced Offer', 'Commercial Quotation')` | Standard page furniture |
| **Meta card** (left, `metaCard()`) | Mint panel, gold left bar. Rows: Client, Address (multi-line — the row *and* the panel grow), Project, Capacity, Reference (quote number), Date, Valid Until (default "30 days from issue"). Empty rows are filtered out; hairline dividers between rows |
| **System Configuration** (right) | Paper panel, emerald top rule. Rows: **Solar Module** (`data.module_config`, default "545 Wp Mono PERC / latest equivalent technology"), **Panel Type** (`data.panel_type` — DCR / Non-DCR, *rendered only when set*, expanded to a full sentence), **Inverter** (`inverter_config`), **DC Capacity** — *only when `dc_capacity > 0`*, **Mounting (MMS)**, **System**, **Net Metering** and **Battery Backup** (`data.net_metering` / `data.battery_backup`, always shown, default **Not included** — the operator can flip either to Included later when it's quoted as extra work). `cfgRowH()` measures each value with `heightOfString` so the panel auto-sizes. **These are operator inputs — never brands.** The page-1 return-on-investment teaser was removed (the detail lives on the Payment & Returns page and in the proposal). |
| **Commercial Offer table** (`line()`) | Row height grows with the label; value right-aligned; `big` rows get a filled panel and white text. Order: single scope line at `c.taxable` → GST rows → **Total Investment (incl. GST)** (emerald) → optional subsidy + Net Investment (deep emerald) |
| **Effective price** | Cream band: `₹ X.XX per Watt (inclusive of GST)` |
| **Savings teaser** | Deep-emerald band, four figures from `model()`: saved/year, payback, 25-year, system life |

`gstRows(c, data)` decides the tax presentation: `data.gst_split === 'igst'` → one IGST line; otherwise **CGST + SGST at half each** (intra-state default). Percentages are derived from `gst / taxable`, not hardcoded.

#### PAGE 2 — Payment & Returns

`flowY(yy, need)` is the page-flow guard used from here on: if the block won't fit above `page.height − 46`, it starts a new page with `chrome` and returns y=110.

| Block | Detail |
|---|---|
| **Payment Schedule** | `normalizeSchedule(data.payment_schedule)` accepts `pct`/`percent`/`percentage`, `stage`/`label`/`milestone`, `against`/`note`/`description`. Default milestones 30/60/5/5 (advance → material readiness → installation → commissioning). Each row auto-heights to its description |
| **Return on Investment** | Four cards from `model()`: Annual Savings, Payback, 25-Year Savings, Net Investment + an italic "indicative only" disclaimer naming the tariff, units/year, 3.5% escalation and 0.6% degradation |
| **Scope of Work** | `scopeAndExclusions()` — two columns (**Arrays Ingenieria Scope** emerald / **Client Scope** gold), check-mark chips, both columns sized to the taller list. Overridable via `data.scope_ours` / `scope_client` (`asList()` accepts an array or newline/bullet text) |
| **Exclusions** | Mint panel; default includes "anything not expressly listed … or agreed by us in writing … is chargeable at actuals" |
| **Extra Technical Requirements / Notes** | Rendered **only if `data.notes` is non-empty**, immediately after exclusions. Panel height measured from the text |

#### PAGE 3 — Terms → Payment details → Client acceptance

Order matters commercially and was set deliberately.

| Block | Detail |
|---|---|
| **Terms & Conditions** | `normalizeTerms(data.terms)` accepts `[{title,body}]`, `["Title: body"]`, or newline text (`parseTitleBody` splits on the first colon ≤44 chars). Falls back to `defaultTerms()`: GST & Taxes, Warranty, Delivery & Timeline, Insurance, Force Majeure, Jurisdiction & Confidentiality. **Payment terms, delay interest, scope and warranty detail are deliberately NOT repeated here** — they have their own sections, and duplication caused contradictions |
| **Payment & Company Details** (`companyBankBlock()`) | Left panel **SUPPLIER**: Company, GSTIN, Office (from the joined `gst_branches` office). Right panel **BANK DETAILS FOR PAYMENT** from the `DEFAULT_BANK` constant — IDBI Bank, Greater Noida; A/c `0875102000012290`; IFSC `IBKL0000875` (verified against a public IFSC registry). Bank details are **fixed in code, not collected in the app** |
| **PAYMENT METHOD** | Cream note: credited only against Proforma Invoice; no GST tax invoice until payment received; delay interest `data.delay_interest` (default 18% p.a.). **Box height is measured from the text** (`pmH = heightOfString + 34`) — it used to overflow |
| **ACCEPTED BY THE CLIENT** | Bottom block: acceptance sentence left, `For <client name>` + signature rule + "Authorised Signatory, Date & Company Seal" right. **This is the client's signature, not ours** |
| `autoGenNote` | "computer-generated … valid without a physical signature" |

### 8.6 `renderBOQ(doc, data, opts)` — the margin fold

*File:* `quote-docs.service.js` L479–551.

Columns are computed from the right edge: `#`, `DESCRIPTION`, `UNIT`, `QTY`, `RATE`, `AMOUNT`. `headerRow(y)` draws the emerald header and is re-drawn after every page break.

**The margin fold — the important part:**

```js
const rawItems = c.items.length ? c.items : null;
const items    = rawItems || [{ item: 'Complete Solar PV System — …', qty: 1, unit: 'Lot',
                                rate: c.taxable, amount: c.taxable }];
const margin   = rawItems ? Math.max(0, (c.taxable || 0) - (c.subtotal || 0)) : 0;
const alloc    = distributeMargin(items, margin);
// per row:
const dispAmount = num(it.amount,0) + (alloc.get(it) || 0);
const dispRate   = dispAmount / (num(it.qty,0) || 1);
```

`distributeMargin(items, margin)` (L28–47):

1. Bucket items by regex — **civil** (`/civil/i`), **installation** (`/install|commission/i`, excluding civil), **rest**.
2. Weights 0.4 / 0.4 / 0.2, **zeroed for absent buckets and renormalised** so the weights always sum to 1.
3. Within a bucket, distribute **pro-rata by item amount** (equal split if the bucket sums to 0).
4. If no bucket exists at all, split evenly.

Result: **items sum exactly to `taxable`**, the client sees only rates, and there is never a "margin" line. Civil and installation always exist in a real BOQ, which is why 40/40/20 was chosen.

Rows alternate a mint background, auto-height to the description, and break to a new page past y=792 (re-drawing the header). Totals: **Sub-Total (before GST) = `c.taxable`** → GST rows → **Grand Total** (emerald). Footnote: "Quantities, makes and specifications are as per the requirement of the client. Errors & omissions excepted."

### 8.7 `renderScope(doc, data, opts)`

Standalone, richer version of the scope block (10 items per side) used by `GET /quotes/:id/scope.pdf`. **Not part of the default package** — scope lives inside the quotation now. Same two-column check-list construction plus a closing "anything not listed is client scope / chargeable at actuals" band.

### 8.8 `renderProposal` — the 22-page book

*File:* `proposal-pdf.service.js` (1779 L). One function per page, all composed in `renderProposal`:

| # | Function | Content |
|---|---|---|
| 1 | `coverPage` | Full-bleed emerald, white logo plate, client/capacity, credential pill |
| 2 | `tocPage` | Contents (extras appended dynamically — FAQ) |
| 3 | `confidentialityPage` | Confidentiality statement |
| 4 | `leadershipPage` | CEO profile |
| 5 | `aboutPage` | Company story + stat band |
| 6 | `whyPage` | "The Veteran Advantage" |
| 7 | `servicesPage` | **Capabilities** — 6 capability cards + 3-photo strip |
| 8 | `industriesPage` | Segments served |
| 9 | `clientsPage` | Client logos/names |
| 10 | `trackRecordPage` | Executed projects table + photo grid |
| 11 | `testimonialsPage` | Client voices |
| 12 | `recognitionPage` | Honours (President/PM/Raksha Mantri/DEFCOM), TV band, **newspaper clippings** |
| 13 | `understandPage` | "Understanding Your Project" — echoes the operator's inputs |
| 14 | `systemDesignPage` | Proposed configuration |
| 15 | `howItWorksPage` | Solar explainer |
| 16 | `netMeteringPage` | Net metering explainer |
| 17 | `executionPage` | Execution methodology |
| 18 | `savingsPage` | **Savings & ROI** — KPI cards, investment breakdown, 25-year cumulative chart with payback marker, with/without-solar bars, keep-roughly band |
| 19 | `environmentPage` | CO₂, trees, cars, coal, homes |
| 20 | `qualityPage` | Quality & warranty |
| 21 | `faqPage` | FAQ (appended after Quality) |
| 22 | `thankYouPage` | White logo plate, closing line, bottom photo with a **multi-stop gradient veil** so it fades into the background instead of ending on a hard edge |

`renderProposal(doc, data, { skipThankYou })` ends at Quality when packaging, so `renderFaq` and `renderThankYou` can be appended after the quotation/BOQ. `technicalPage` / `renderTechnical` still exist but are **not** in the default package.

### 8.9 Rendering a PDF — the API surface

```
GET /api/quotes/:id/document.pdf?parts=proposal,quotation,boq   ← combined package
GET /api/quotes/:id/proposal.pdf | quotation.pdf | boq.pdf | scope.pdf
GET /api/quotes/:id/pdf                                         ← legacy single-file
GET /api/invoices/:id/pdf
```

All are `denyExportForAdmin`. Downloads from the UI go through `download()` so the JWT is sent and the EN/हिन्दी prompt appears for translatable documents.

### 8.10 Verifying a PDF change — do this every time

`pdftoppm` is **not installed**. Use `pdf-to-png-converter` (already a server dependency), run from `server/`:

```bash
node -e "
import('pdf-to-png-converter').then(async ({pdfToPng}) => {
  const pages = await pdfToPng('C:/path/out.pdf', { viewportScale: 1.6, pagesToProcess: [4] });
  const fs = require('fs');
  pages.forEach(p => fs.writeFileSync('C:/path/page-' + p.pageNumber + '.png', p.content));
});
"
```

Then **look at the PNG**. Paths must be **Windows form** (`C:/Users/...`); a Git-Bash `/c/Users/...` path makes Node resolve `C:\c\Users\...` and fail.

**Layout rule:** never hardcode a box height around variable text. Measure with `doc.heightOfString(text, { width, lineGap })` and size the panel from it. Every "text escaping its box" bug in this codebase came from a fixed height.

---

## 9. The database

### 9.1 Definition files

- `server/src/db/schema.sql` — core ERP (~23 tables)
- `server/src/db/gst-schema.sql` — GST, challans, allocations, own accounts (~30 tables)

Both **idempotent**: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, enums wrapped in `DO $$ … EXCEPTION WHEN duplicate_object`.

### 9.2 Core tables

`users` `audit_logs` `projects` `sites` `vendors` `vendor_accounts` `employees` `clients` `expense_categories` `documents` `payments` `invoices` `invoice_items` `receipts` `ledger_entries` `bank_statements` `bank_statement_lines` `materials` `shipments` `geo_verifications` `quotes` `vault_documents` `vault_document_versions` `own_accounts` `project_payment_terms` `incoming_payment_allocations` `outgoing_payment_allocations`

### 9.3 GST tables

`gst_master_data` `gst_einvoices` `gst_eway_bills` `gst_api_logs` `gst_audit_events` `gst_access_logs` `gst_recon_resolutions` `gst_notifications` `gst_branches` `gst_number_series` `gst_attachments` `gst_gstin_validations` `gst_otp_challenges` `gst_scheduled_reports` `gst_report_runs` `gst_backups` `app_config` `gst_versions` `gst_comments` `gst_comment_reads` `gst_saved_views` `gst_imports` `delivery_challans` `delivery_challan_items` `delivery_challan_status_history` `delivery_challan_returns`

### 9.4 Views — derived truth

```
v_vendor_balances   v_client_balances   v_employee_balances
v_vendor_spend      v_outgoing_alloc    v_incoming_alloc
```

**Never write a balance column.** Add or extend a view.

### 9.5 Enums

`user_role` `payment_mode` `invoice_status` `invoice_type` `invoice_link` `ledger_party` `ledger_direction` `recon_status` `material_status` `quote_status` `gst_einv_status` `gst_ewb_status` `dc_status`

> **Enum gotcha:** PostgreSQL cannot add an enum value inside a transaction, and `schema.sql` runs as one. `migrate.js` therefore issues `ALTER TYPE … ADD VALUE IF NOT EXISTS` **before** applying the schema. Follow that pattern. On insert, cast explicitly: `COALESCE($2,'draft')::quote_status`.

### 9.6 ⚠️ Migrations do NOT run on server boot

`index.js` does **not** apply the schema. Editing `schema.sql` alone changes nothing on a running database — you get `column "x" does not exist` at runtime.

```bash
npm run migrate --prefix server
```

One-off column against a live DB (run from `server/`):

```bash
node -e "import('./src/config/db.js').then(async m => { await m.query('ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ'); process.exit(0); })"
```

Always add it to `schema.sql` **as well**, so fresh installs get it.

### 9.7 Soft delete — two conventions

- `is_deleted BOOLEAN` — payments, receipts, invoices, projects (Recovery Center)
- `deleted_at TIMESTAMPTZ` — quotes (Trash / restore / purge)

**Every list query must filter deleted rows explicitly.**

---

## 10. Frontend architecture

### 10.1 Structure

One file per screen in `pages/`; a page owns its state, fetching and modals. Routing and role gating in `App.jsx`. `Hubs.jsx` groups related screens (Reports / Activity / System Status / Data Admin).

### 10.2 Data flow

```js
const { data, loading, error, refetch } = useFetch(`/quotes?${qs}`, [qs]);

import { api, apiError } from '../api/client.js';
await api.post('/quotes', body);
await api.delete(`/quotes/${id}?purge=1`);
toast.error(apiError(e));
```

`useFetch` re-runs when its dependency array changes — build the query string first and pass it as the dep, as the pages do.

### 10.3 UI kit

`Card`, `PageHeader`, `Table`, `Badge`, `EmptyState`, `Loading`, `Field`, `DescList/DescRow`, `Modal`, `useToast()`, `ProofView`. Tailwind utilities `.input`, `.btn-primary`, `.btn-ghost`, `.td` live in `client/src/index.css`.

`Table({ columns, rows, renderRow, onRowClick })`. **When a clickable row contains buttons, stop propagation on that cell:**

```jsx
<td className="td" onClick={(e) => e.stopPropagation()}>…</td>
```

### 10.4 ⚠️ Numeric inputs — never `type="number"` for decimals

`<input type="number">` with `onChange={e => Number(e.target.value)}` makes decimals **impossible to type**: the intermediate `"0."` coerces to `0` and the point is erased, forcing the user onto the spinner arrows. Use:

```jsx
<input type="text" inputMode="decimal" value={v ?? ''} onChange={e => setX(e.target.value)} />
```

Keep the **raw string** in state; the server coerces (`clean()` in `quote-calc.service.js`). This shipped as a bug once — do not reintroduce it.

---

## 11. Cross-cutting concerns

| Concern | Where | Notes |
|---|---|---|
| **Errors** | `middleware/error.js`, `utils/asyncHandler.js` | Throw `new ApiError(status,msg)`; response `{ error, detail }` |
| **Audit** | `middleware/audit.js` | `await audit(req, { action, entity, entityId })` on every mutation |
| **Uploads** | `middleware/upload.js` | multer; `UPLOAD_DIR`, `MAX_UPLOAD_MB` |
| **Validation** | `zod` | Available; applied unevenly — prefer it for new endpoints |
| **Money format** | `client/src/lib/format.js` | `inr()`, `inr(x,{compact:true})` |
| **Numeric SQL** | `NUMERIC(16,2)` | **`pg` returns numerics as strings** — always `Number(...)` before math |
| **Branch context** | `x-gst-branch` header | Scopes GST data to a branch/GSTIN |
| **i18n** | `pdf-i18n.js`, `lib/i18n-dict.js` | EN/हिन्दी downloads; Mukta font only |

---

## 12. Operational runbook

**Restart the server (Windows):**

```bash
powershell -Command "Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
```

then from `server/`: `node src/index.js`. **Wait ~5 seconds** before curling — an early request returns HTTP 000.

**Smoke-test:**

```bash
curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"editor\",\"password\":\"editor@123\"}"
```

(field is `email`, value is the bare word `editor`), then send `Authorization: Bearer <token>`.

**After a schema change** → `npm run migrate --prefix server` (§9.6).
**After a frontend change** → `npm run build --prefix client` (the server serves `client/dist`; an unbuilt change is invisible).
**Delivering PDFs to the owner's phone** → copy into `C:\Users\siddh\OneDrive\`, which syncs to the cloud.
**Backups** → automatic every 2h (keep 30); verify / DR-test / preview-restore from `pages/GstBackup.jsx`.

---

## 13. Gotchas that will bite you

1. **Migrations don't run on boot** (§9.6).
2. **Login field is `email`, value is `editor`** — not `username`.
3. **`pg` returns `NUMERIC` as strings.** `"1200.50" + 1 === "1200.501"`. Coerce first.
4. **Enum values can't be added inside a transaction** — add in `migrate.js` before the schema; cast on insert.
5. **`type="number"` breaks decimal entry** (§10.4).
6. **Rates are ₹/watt, not ₹/kW.** ₹4/W × 25 kWp = ₹1,00,000.
7. **Margin must apply to *both* BOQ paths.** It was silently dropped on custom items once; the fix is in `quote-calc.service.js`. Client-facing, margin is folded into rates and never shown.
8. **The quotation signature is the *client's* acceptance.**
9. **Never invent commercial facts in a PDF** (§1.4).
10. **`server/.env` is per-machine and git-ignored.** Verify with `git ls-files | grep .env` — only `.env.example` should appear.
11. **Windows vs Git-Bash paths in Node** (§8.10).
12. **Rebuild the client** after frontend edits.
13. **The in-app preview tab is backgrounded** in this environment — screenshots time out and Framer animations sit at `opacity:0`. Verify UI via computed styles and PDFs via rendered PNGs.
14. **Never hardcode a panel height around variable text** — measure with `heightOfString` (§8.10).
15. **`page.margins.bottom = 0` must be re-applied on `pageAdded`** or pdfkit auto-breaks mid-panel.

### Repository conventions

- **Author:** Siddhant Kumar. Commit messages are clean and human — **no AI/assistant attribution, no `Co-Authored-By` trailers.**
- Style: `Area: what changed` — e.g. `Quote: operator-driven system config, margin folded into BOQ, soft-delete`.
- Data lives in PostgreSQL, **not** in git.

---

## 14. Known issues and tech debt

**`FUNCTIONAL-ISSUES.md` is the ranked list — read it before touching money logic.** Headline items:

1. **Reconciliation classifies by direction alone** — every debit a vendor expense, every credit client income. `own_accounts` + `transaction_type` mitigate but do not fully solve it; refunds, loans and inter-account moves can still distort totals.
2. **Dashboard totals inherit any upstream misclassification** (§7.10).
3. **`autoMapClient` is looser than the vendor matcher** (plain `similarity()`, name-only) — higher false-match risk.
4. **Candidate parties accumulate** — auto-created `is_candidate` vendors/clients need periodic review/merge.
5. **Two soft-delete conventions** (`is_deleted` vs `deleted_at`) — unify eventually.
6. **`zod` validation applied unevenly** across routes.
7. **Client bundle >500 kB** — no code splitting yet.
8. **`quote-pdf.service.js` is a legacy path** superseded by `quote-docs.service.js`; `technicalPage` is dead in the default package.
9. **`docs/DEVELOPER.md` is older and GST-focused** — superseded by this handbook.

### Open items owed by the business owner

- Section D proposal content (project photos, experience, track record, client voices, media).
- A genuine **Tata Motors solar** photo — the only real Tata Motors image is piling/civil work, so the capabilities tile shows a generic ground-mount photo labelled honestly rather than misattributing another site's array.

---

## 15. Glossary

### Solar / EPC

| Term | Meaning |
|---|---|
| **EPC** | Engineering, Procurement, Construction — design + procure + build |
| **kW / kWp / Wp** | Kilowatt; kilowatt-peak (panel rating); watt-peak. Quote rates are per **watt** |
| **AC vs DC capacity** | DC = total panel wattage, usually **higher** than the AC (inverter) rating |
| **BOQ** | Bill of Quantities — itemised supply list with qty/unit/rate |
| **MMS** | Module Mounting Structure (aluminium / GI) |
| **BOS** | Balance of System — cables, earthing, LA, ACDB/DCDB |
| **String inverter** | Converts panel DC to grid AC |
| **Mono PERC / TOPCon** | Panel cell technologies (e.g. 545 Wp Mono PERC) |
| **SLD** | Single-Line Diagram — the electrical schematic |
| **CUF** | Capacity Utilisation Factor; ~1,500 kWh/kWp/yr ≈ 17% |
| **DISCOM** | Electricity distribution company |
| **Net metering** | Exporting surplus solar to the grid against your bill |
| **PM Surya Ghar** | Residential rooftop subsidy scheme, capped ₹78,000 |
| **O&M** | Operations & Maintenance |
| **Piling** | Driving foundations for ground-mount structures |
| **Tensile work** | Fabric/cable-tension structures (a civil line of business) |

### Finance / statutory (India)

| Term | Meaning |
|---|---|
| **GST** | Goods & Services Tax. **CGST + SGST** intra-state; **IGST** inter-state |
| **GSTIN** | 15-character GST registration number, per state |
| **IRN** | Invoice Reference Number — the e-invoice identifier (with signed QR) |
| **IRP** | Invoice Registration Portal — issues the IRN |
| **E-way bill** | Document required to move goods above a value threshold |
| **Rule 55 challan** | Delivery challan for movement that is **not** a sale (e.g. to site) |
| **HSN / SAC** | Goods / services classification codes |
| **Proforma invoice** | Pre-payment bill; not a tax invoice |
| **TDS** | Tax Deducted at Source — withheld by the client, still reduces what they owe |
| **Retention** | Amount held back until project completion |
| **UTR** | Unique Transaction Reference for a bank transfer |
| **NEFT / RTGS / IMPS / UPI** | Indian payment rails |
| **VPA** | Virtual Payment Address (UPI handle) |
| **PO** | Purchase Order |
| **Running account bill** | Progressive billing against work completed to date |
| **Measurement sheet** | Itemised work-done sheet backing a running-account bill |
| **GSTR** | GST return forms reconciled in the GST module |

---

*Maintained alongside the code. When you change behaviour described here, update this file in the same commit.*
