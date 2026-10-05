# Developer Documentation

> **Start with [DEVELOPER-HANDBOOK.md](DEVELOPER-HANDBOOK.md).** It is the complete,
> current reference for the whole ERP — business context, every module, the database,
> the PDF engine, the runbook and the gotchas. This file is older and GST-focused;
> where the two disagree, the handbook is newer.

## Project structure

```
client/                     React 18 + Vite SPA
  src/
    pages/                  screens (ERP + Gst*.jsx)
    components/             ui kit, layout, gst/ widgets
    context/                Auth, Branch, I18n
    lib/                    api client, helpers (gst.js), i18n dict
    api/client.js           axios instance (JWT + x-gst-branch headers)
server/
  src/
    index.js                Express app; serves built client + /uploads; applies runtime config on boot
    config/                 db (pg Pool + withTransaction), env, company
    middleware/             auth (JWT + maintenance enforcement), rbac, upload (multer), error, audit
    routes/                 REST endpoints (gst.routes.js mounts /api/gst)
    services/gst/           the compliance engine (below)
    db/                     schema.sql, gst-schema.sql, migrate, seed, gst-seed, gst-demo
docs/                       reports + this documentation
```

## Architecture layers
- **Adapter layer** (`services/gst/adapter.js`) — the only path to the portal. `getAdapter()` returns the Simulation or Live adapter based on `GST_MODE`. Standard envelope: `{ ok, status, httpStatus, data, errorCode, errorMessage }`.
- **Validation layer** (`validation.js`) — pure, synchronous, entry-time checks mirroring portal rules. Returns `{ code, field, message, severity }[]`.
- **Builder layer** (`einvoiceBuilder.js` v1.1, `ewbBuilder.js`) — map the internal camelCase record → official portal keys.
- **Service layer** (`einvoiceService.js`, `ewbService.js`, …) — lifecycle, transactions, audit + API logging, version snapshots.
- **Audit layer** — `gst_audit_events` (state changes) + `gst_api_logs` (request/response). Both **append-only** (DB triggers block UPDATE/DELETE).
- **Reporting layer** (`reportService.js`) — dashboard + 8 reports; `exporter.js` → csv/xlsx/json.

## Key services (`server/src/services/gst/`)
`adapter, validation, einvoiceBuilder, ewbBuilder, masterData, einvoiceService, ewbService, branchService, seriesService, duplicateService, gstinValidationService, attachmentService, otpService (2-step verify), reconService, notifyService, monitorService, reportService, scheduleService, importService, backupService (full-system), configService (maintenance + integrations + export), versionService, commentService, searchService, savedViewService, brandingService, feedService, diagnosticsService, readinessService, pdf.`

## API conventions
- Base: `/api`. Auth: `Authorization: Bearer <jwt>`. Branch context: `x-gst-branch: <branchId>`.
- GST routes under `/api/gst/*`, permission-gated via `requirePerm(PERMS.*)`.
- Critical actions accept `otpToken` (from the 2-step verify flow) and return **428** when verification is required.
- Errors: `{ error, detail }` with appropriate HTTP status (400/401/403/404/409/410/422/423/428/502/503).

### Representative endpoints
```
POST /api/auth/login                      → { token, user }
GET  /api/gst/me/permissions              → role, permissions, mode, maintenanceMode, hasTodayBackup
GET  /api/gst/einvoices            POST /api/gst/einvoices
POST /api/gst/einvoices/:id/validate | /submit | /cancel | /restore-version
GET  /api/gst/einvoices/:id/pdf | /json
… (parallel /ewbs/*, incl. /generate /update-partb /extend /close /from-einvoice/:id)
GET  /api/gst/dashboard | /recon | /search?q= | /feed | /versions/:type/:id | /comments
GET/POST /api/gst/branches | /number-series | /views | /schedules | /branding | /integrations
GET  /api/gst/backups (+dashboard/today/:id/verify/preview-restore/dr-test/restore)
GET  /api/gst/diagnostics | /readiness | /test-suite | /maintenance | /config/export
```

## Engines
- **Validation engine** — GSTIN format+check-digit (`gstinCheckDigit`), HSN length, pincode↔state, item bounds, valuation reconciliation, transport-mode logic.
- **PDF engine** (`pdf.js`) — pdfkit `bufferPages`; repeating header, footer + "Page X of Y", paginated item tables, branding (logo/header/footer/terms/disclaimer/watermark/signature/stamp). QR via `qrcode`.
- **Backup engine** — dynamic table discovery (information_schema) + attachment files → `CompanyBackup_<ts>.zip` (adm-zip), checksum manifest, additive restore by primary key.
- **Reporting engine** — `REPORTS` map; exporter to xlsx (exceljs) / csv / json.

## Database
- Core ERP: `users, clients, vendors, employees, projects, sites, invoices, payments, receipts, ledger_entries, bank_statements, …`
- GST: `gst_einvoices, gst_eway_bills` (jsonb schema blocks + scalars), `gst_master_data, gst_branches, gst_number_series, gst_attachments, gst_gstin_validations, gst_otp_challenges, gst_scheduled_reports, gst_report_runs, gst_backups, gst_imports, gst_recon_resolutions, gst_notifications, gst_versions, gst_comments, gst_comment_reads, gst_saved_views`, `app_config`.
- Immutable: `gst_api_logs, gst_audit_events, gst_versions` (triggers block mutation).
- Apply: `npm run migrate` (schema.sql then gst-schema.sql, idempotent). Seed: `npm run seed`, `npm run gst:seed`, `npm run gst:demo`.

## Adding a portal field (future-proofing)
Schema blocks are JSONB and the builder maps to official keys — so a notified field
change touches `masterData.js` (enum), `validation.js` (rule) and the relevant
**builder** only. No table migration for most additions.

## Going live
Implement `LiveAdapter` in `adapter.js` (token auth + payload encryption + digital
signature) and set credentials via **Integrations** (`GST_MODE=live`). No other
code changes; the whole app already routes through `getAdapter()`.
