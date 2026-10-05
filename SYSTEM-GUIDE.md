# ARRAYS-ERP — System Guide (Plain Language)

_Last updated: 2026-08-01. This document explains **what every part of the software does and how it works**, in plain language, so anyone (not just a programmer) can understand the machine. A companion file, **FUNCTIONAL-ISSUES.md**, lists the logic bugs found in this same audit._

> **Developers / AI assistants:** read **[docs/DEVELOPER-HANDBOOK.md](docs/DEVELOPER-HANDBOOK.md)** instead — it is the deep technical reference (architecture, every module and file, database, PDF engine, runbook, gotchas, glossary). This guide stays as the plain-language overview.

---

## 1. The big picture

This is an in-house ERP (Enterprise Resource Planning) system for a Solar EPC company (Arrays / AIPL). It runs entirely on your own computers — a web app in the browser talking to a local server and a local PostgreSQL database. One machine can also **Publish to Cloud** so a second machine sees the same data.

There are **two kinds of login**:
- **Editor / Operator** — can create and change everything.
- **Admin** — view-only (cannot import or write). Enforced by `denyWriteForAdmin` / `noImportForAdmin` on every money route.

### The three layers
| Layer | Where | What it is |
|---|---|---|
| **Client** | `client/` (React) | The screens you click — pages under `client/src/pages/`. |
| **Server** | `server/src/` (Node/Express) | The API — routes under `routes/`, business logic under `services/`. |
| **Database** | PostgreSQL | The actual data. Schema in `server/src/db/schema.sql` and `gst-schema.sql`. |

The server serves the built client on **port 4000**, so in normal use everything is at `http://localhost:4000`.

### Recent upgrades (2026-08-01)
- **Own Bank Accounts + transaction type** — `Ledgers → Own Bank Accounts`. Transfers between your own accounts (OD ↔ current) are auto-detected and excluded from income/expense. Payments carry a **Transaction Type** (expense / internal_transfer / financing). A **Re-scan existing** button fixes historical data. Files: `services/ownAccountsService.js`, `routes/ownAccounts.routes.js`, `pages/OwnAccounts.jsx`.
- **Duplicate guard** — re-saving the same UTR is blocked (409 + override); statement re-imports skip already-recorded references.
- **Vendor merge & candidate review** — merge duplicate vendors, review auto-created candidates, tighter auto-link threshold. `routes/vendors.routes.js`, `pages/Vendors.jsx`.
- **Automatic cloud publish** — after any change a debounced background publish runs; sign-out flushes everything to the cloud (mandatory); the manual button remains. The publish now copies **every** table dynamically (nothing is skipped). Files: `services/autoSync.js`, `services/sync.service.js`, `routes/system.routes.js`.
- **Open stored files** — every payment/receipt proof can be opened in-app (authenticated blob viewer). `components/ui/ProofView.jsx`, `routes/documents.routes.js`.
- **Storage housekeeping** — proof/statement files older than 30 days are zipped into monthly archives; they still open transparently. `services/proofArchiver.js`.
- **Better scanner** — UPI reference/VPA parsing, largest-amount fallback, and **failed-transaction detection**. `services/ocr.service.js`.
- **Crash resistance** — a bad upload or a failed publish can no longer take the whole server down (`index.js` process guards).

---

## 2. The core idea: everything is a ledger

The heart of the system is the **party ledger** (`ledger_entries` table, `services/ledger.service.js`).

- A **vendor** is someone you pay (suppliers, labour, transport).
- A **client** is someone who pays you (the customer on a project).
- Every payment, receipt and invoice writes **double-sided ledger entries** against a vendor or a client.
- **Balances are never stored directly** — they are computed from the ledger by database views (`v_vendor_balances`, `v_client_balances`). This is good design: balances always reconcile with the entries.

So when something is deleted or edited, the code **removes the old ledger entries and re-posts new ones** (`removeLedgerForSource` → `postLedgerEntry`). That is why deleting a payment correctly fixes the vendor balance.

**Direction convention:**
- Client ledger: `debit` = you billed them (receivable goes up); `credit` = they paid you (receivable goes down).
- Vendor ledger: `credit` = they billed you / you owe them; `debit` = you paid them (what you owe goes down).

---

## 3. Money in and money out — the four modules

### 3.1 Outgoing Payments (`/payments`, `routes/payments.routes.js`)
Money **you pay out**.

**Two ways to create one:**
1. **Screenshot / proof import** — Upload a payment screenshot or PDF → `POST /payments/extract` runs OCR (`ocr.service.js → parsePaymentFields`) and pulls out reference/UTR, amount, date, beneficiary, account, network (NEFT/RTGS/etc). The operator reviews the fields, then `POST /payments` saves it.
2. **From bank reconciliation** — a debit line in an uploaded statement becomes a payment (see §4).

**On save:** a mandatory operator **comment** is required, the system tries to **auto-map a vendor** (by beneficiary account number, else fuzzy name), and posts a **debit to the payee's ledger** (employee if it's an employee payment, otherwise the vendor).

**Allocation / tagging** — a single payment can be split across several projects/sites/"Other" via `/payments/:id/allocations`. The amount/date/reference/vendor stay **locked**; only the split table changes.

### 3.2 Incoming Receipts (`/receipts`, `routes/receipts.routes.js`)
Money **you receive**.

- Same two entry paths (proof extract, or a credit line from reconciliation).
- Requires a **client**. On save it posts a **credit to the client ledger** for the *full settled value* = cash credited **+** deductions **+** TDS **+** retention (because all of those reduce what the client still owes).
- Can be linked to an invoice; if so, the invoice's `amount_received` and status (`partially_paid` / `paid` / `overdue`) auto-refresh (`refreshInvoiceStatus`).

### 3.3 Invoices (`/invoices`, `routes/invoices.routes.js`)
Bills **you raise on clients**. Rich PDF generation (`invoice-pdf.js`) in the ARRAYS running-account format, plus an auto-generated **Measurement Sheet**. Editable letterhead. Soft-deletable and recoverable.

### 3.4 The ledgers (Vendors / Clients / Employees)
`/vendors`, `/clients`, `/employees` each have a **master record** and a **ledger view** built from `ledger_entries`. The list pages show live balances from the balance views.

---

## 4. Bank Reconciliation (`/reconciliation`, `routes/reconciliation.routes.js`)

This is where a **monthly bank statement** is matched against what's already recorded.

**Flow:**
1. **Upload** a statement (PDF, Excel, or CSV) → `parseStatement` (`reconciliation.service.js`) turns it into transaction lines.
   - PDF IDBI "Statement of Transaction" tabular format → `parseIdbiTabular`.
   - PDF IDBI "OpTransactionHistory" tail format → `parseIdbiBlocks`.
   - Excel/CSV → column detection.
   - Each line's narration is parsed (`narration.service.js`) into mode / reference / account / beneficiary.
2. **Auto-match** each line (`matchLine`):
   - **Debit** → looks for an existing **payment** (by reference, else amount + date ±3 days).
   - **Credit** → looks for an existing **receipt**.
   - Result is `matched`, `unmatched`, or `duplicate` (2+ candidates).
   - Also tries to **auto-map a vendor** (debits) or **client** (credits) onto the line.
3. **Resolve unmatched lines:**
   - `POST /statements/:id/import-missing` — one click: turn **all** unmatched debits into payments and credits into receipts, auto-creating vendors/clients as needed.
   - `POST /lines/:id/resolve` — resolve one line with a mandatory comment and a chosen project/vendor/client.
   - `POST /lines/:id/ignore` — mark a line as a duplicate to ignore.

> ⚠️ **This is the single most important thing to understand for the bugs below:** reconciliation assumes **every debit is an expense to a vendor** and **every credit is income from a client**. It has **no concept of your own bank accounts** or **internal transfers**. See FUNCTIONAL-ISSUES.md #1 and #2.

---

## 5. Vendor / Client auto-mapping (`services/vendor-match.service.js`)

The "intelligence" that links a raw bank line to a known party.

- **`findVendorByAccount`** — exact match on beneficiary account number (in `vendor_accounts` or `vendors.bank_account`). Confidence 100.
- **`findVendorByName`** — fuzzy name match using PostgreSQL `pg_trgm` (`similarity` + `word_similarity`), floor `NAME_THRESHOLD = 0.34`. `normalizeName()` first strips honorifics (MR/MRS/SHRI…), "S/O …" tails, and bank tokens (NEFT/UPI/REF…).
- **`autoMapVendor`** — account first, then name.
- **`findOrCreateVendor` / `findOrCreateClient`** — if nothing matches, **auto-create a lightweight "candidate"** party (`is_candidate = true`) so reconciliation never stalls. The operator is expected to enrich/clean these later.
- **`autoMapClient`** — same idea for clients, but name-only and uses plain `similarity()` (looser than the vendor matcher).

`vendor_accounts.account_number` is **globally unique**, which is how re-imports avoid duplicate vendors *when the account number is known*.

---

## 6. OCR & extraction (`services/ocr.service.js`, `narration.service.js`)

- **`extractText`** — images → `tesseract.js`; PDFs → `pdfjs-dist` (in-process, memory-friendly).
- **`parsePaymentFields`** — heuristic parser that pulls reference/UTR, amount, date, beneficiary ("To Account" name, **not** "From Account"), beneficiary account, network, and remarks out of the raw text. Handles two-column screenshot bleed and multi-line wrapped names.
- **`parseReceiptFields`** — same, for incoming credits.
- **`parseInvoiceFields`** — invoice number, date, taxable/GST/total.

> The extractor's **only** job is to read the screenshot in front of it. It does not read the bank statement — those are separate flows.

---

## 7. Dashboard & Reports (`routes/dashboard.routes.js`, `reports.routes.js`)

The dashboard KPIs are simple sums:
- **`total_outgoing`** = SUM of all non-deleted payments.
- **`total_incoming`** = SUM of all non-deleted receipts.
- **`net_position`** = incoming − outgoing.
- **`pending_receivables`** = SUM of client outstanding from the ledger.
- **`vendor_liabilities`** = SUM of positive vendor balances.
- Cashflow chart, expense-by-category, expense-by-project (uses allocation views `v_incoming_alloc`/`v_outgoing_alloc`), vendor-spend, receivable-aging, client-revenue, recent feed.

Everything correctly excludes soft-deleted rows (`is_deleted = FALSE`).

> ⚠️ Because incoming = **all** receipts and outgoing = **all** payments, any misclassification upstream (an internal transfer booked as a receipt, a refund booked as income) **directly inflates these headline numbers**. The dashboard is only as correct as the classification feeding it.

---

## 8. GST module (`routes/gst.routes.js`, `services/gst/…`)

A large, largely self-contained sub-system for Indian GST compliance:
- **E-Invoices** (`einvoiceService`, IRN/QR), **E-Way Bills** (`ewbService`), **Delivery Challans** (Rule 55, `challanService`), **Quotations** (`quote-*`).
- Supporting services: branches/offices, number series, branding, backups & auto-backup, diagnostics, readiness, reconciliation (GSTR), reports, schedules, notifications, feed, duplicate detection, GSTIN validation.
- Reuses the same PDF house-style helpers (`gst/pdf.js`).
- **Recovery Center** (`/recovery`) — 30-day soft-delete restore for invoices, e-invoices, e-way bills, challans, payments, receipts, projects. Daily purge of anything older than 30 days (`recoveryPurge.js`).

---

## 9. Projects & Sites (`routes/projects.routes.js`, `sites.routes.js`)

- **Projects** carry PO number/date, contract value, budget, status (active/complete), soft-delete, and **Payment Terms / milestone** checklists (due vs released).
- **Sites** carry PO number/date and capacity (kW).
- Project rollups (spent/received) use the allocation-aware views so split payments attribute correctly.

---

## 10. System, Sync, Backup, Audit

- **Publish to Cloud** (`services/sync.service.js`) — mirrors the local database to a cloud PostgreSQL (Neon). **Full overwrite**, table by table, in foreign-key order, self-healing enum drift. Requires `CLOUD_DATABASE_URL` in `server/.env` (per-machine, git-ignored).
- **Backups** (`gst/backupService.js`, `autoBackup.js`) — automatic, stored in a separate local folder, auto-deleted after 30 days.
- **Audit log** (`middleware/audit.js`, `/audit`) — every create/update/delete is recorded.
- **Recovery Center** — see §8.

---

## 11. How data flows (one screenshot, end to end)

```
Payment screenshot
   → POST /payments/extract  (OCR → parsePaymentFields → suggested vendor)
   → operator reviews fields + adds mandatory comment
   → POST /payments          (insert row → auto-map vendor → post ledger DEBIT)
   → vendor balance view recomputes
   → dashboard total_outgoing += amount
```

```
Bank statement (month)
   → POST /reconciliation/statements  (parse → match each line → auto-map party)
   → matched / unmatched / duplicate counts
   → operator: import-missing OR resolve line-by-line
   → creates payments (debits) / receipts (credits) + ledger entries
```

---

## 12. File map (quick reference)

| You want to change… | Look in… |
|---|---|
| How a payment is saved / auto-mapped | `server/src/routes/payments.routes.js` |
| How a receipt is saved | `server/src/routes/receipts.routes.js` |
| How a bank statement is parsed & matched | `server/src/services/reconciliation.service.js` + `routes/reconciliation.routes.js` |
| How a vendor/client is matched or auto-created | `server/src/services/vendor-match.service.js` |
| How a screenshot is read | `server/src/services/ocr.service.js` |
| Bank narration → structured fields | `server/src/services/narration.service.js` |
| The party ledger (balances automation) | `server/src/services/ledger.service.js` |
| Dashboard KPI math | `server/src/routes/dashboard.routes.js` |
| Financial reports | `server/src/routes/reports.routes.js` |
| Database tables & views | `server/src/db/schema.sql`, `server/src/db/gst-schema.sql` |
| GST sub-system | `server/src/routes/gst.routes.js`, `server/src/services/gst/` |
| The screens | `client/src/pages/` (one file per page) |
```
