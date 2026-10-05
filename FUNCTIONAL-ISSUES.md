# ARRAYS-ERP — Functional Issues Found (Audit 2026-08-01)

_These are **logic / business-correctness** problems found by reading the code, not cosmetic ones. Each has: what goes wrong → why (root cause, with file) → how to fix. Ranked by how badly they distort your numbers. Read alongside **SYSTEM-GUIDE.md**._

Legend: 🔴 corrupts financial totals · 🟠 pollutes master data · 🟡 correctness/robustness

---

## ✅ Fixed in this pass (2026-08-01)
- **#1 Internal transfers, #2 own company as party, #6 financing** — added an **Own Bank Accounts** master (`Ledgers → Own Bank Accounts`) and a transaction **`txn_kind`** (`expense`/`income`/`internal_transfer`/`financing`/`refund`). A bank line whose counterparty matches an own account is auto-flagged **internal transfer**: no client/vendor created, no party ledger posted, and **excluded from income/expense** on the dashboard, cashflow, category/vendor/client rollups and financial reports. The payment form has a **Transaction Type** selector, and reconciliation lets you classify a line as financing/refund manually.
- **#2b Historical clean-up** — a **"Re-scan existing"** button on the Own Bank Accounts page re-tags already-recorded payments/receipts that match an own account and **reverses their wrong ledger entries** (`POST /own-accounts/reclassify`).
- **#3 Duplicate screenshots / re-imports** — saving a payment/receipt with a UTR that already exists is **blocked (409)** with an explicit override; `import-missing` **skips** already-recorded references; the payment form shows a duplicate warning + "save anyway" checkbox.
- **#4 Vendor master** — **merge duplicates** (`POST /vendors/:id/merge`, repoints payments/ledger/accounts/statement-lines then deletes the dupe), a **"Review candidates"** filter, a **likely-duplicates** finder (`/vendors/:id/duplicates`), and a **higher auto-link threshold** (0.55) so a weak name match creates a reviewable candidate instead of silently mis-linking.
- **Scanner** — OCR now reads **UPI reference formats** (UPI ref / GPay-PhonePe-Paytm ids / bare 12-digit), captures **UPI VPA**, has a **largest-amount fallback**, and detects **FAILED / pending** transactions so a failed payment isn't booked as successful (surfaced as a red warning in the form).
- _Verified end-to-end: dedup 409 + override; ₹999,999 internal transfer excluded; vendor merge (100% match → merged → 404); re-scan re-tagged a bogus self-client receipt; OCR unit tests (UPI ref, VPA, amount, failed status) all pass._

**Fresh full-app pass (2026-08-01 wave 3):**
- **Invoice numbering** — numbers had **no uniqueness guard** (two invoices could share one) and had to be hand-typed. Now: blank → **auto-allocated sequentially** from the series, a manual number is honoured but **duplicates are rejected (409)**, the form pre-fills the next number (editable — manual entry + **backdating** both supported), and the format no longer emits a stray leading slash.
- **E-invoice / e-way / invoice / challan dates showed "yesterday"** — a UTC-vs-IST bug (`toISOString()` gives the UTC date). Added `todayISO()`/`todayIST()` (Asia/Kolkata) and fixed all date defaults; verified the e-invoice date now defaults to today.
- **Payments & receipts are now editable** — a typo previously forced delete-and-recreate; both now have an **Edit** button that re-posts the ledger. Verified in the browser.

**Statement integrity (2026-08-01 wave 4):**
- **Deleting a statement-linked payment silently broke the statement.** Now: a **"Mark Duplicate"** action keeps the extra transaction on record and linked to its statement line but excludes it from every total/ledger (new `duplicate` txn_kind) — the preferred alternative to deleting. Deleting a statement-sourced payment/receipt now shows a **strong warning**.
- **Statement Health check** — per statement (and a `missing_count` on the list) cross-checks every matched line against the live record and lists any that were deleted ("record moved to Recovery Center" / "permanently deleted"). Endpoint `GET /reconciliation/statements/:id/health`.
- **Delete statement** — `DELETE /reconciliation/statements/:id` removes the statement + its parsed lines but **keeps** the imported payments/receipts (they're real).
- _Verified: mark-duplicate drops the total & keeps the record; health flags a deleted matched line; delete-statement 200 + payment retained._

**Auto-health + more fixes (2026-08-01 wave 5):**
- **Statement health is now automatic** — the reconciliation summary computes missing transactions across ALL statements; the page shows a **Missing** card and, when any exist, a **red banner** at the top plus a red badge on each affected statement row. No clicking needed.
- 🔴 **`restore()` ignored `txn_kind`** — restoring a soft-deleted `duplicate` / `internal_transfer` payment (which keeps its `vendor_id`) re-posted a ledger entry, corrupting the vendor balance. Fixed in `paymentService.restore` + `receiptService.restore` (only re-post for expense/income). _Verified: mark-dup → delete → restore leaves ledger at 0._
- 🔴 **`refreshInvoiceStatus` counted non-income receipts** — a receipt marked `duplicate`/transfer but linked to an invoice still inflated its "amount received" and could mark it paid. Now filters `txn_kind='income'`.
- **Dashboard "recent" feed** showed duplicates/transfers as real activity — now filtered to operating transactions.

**Backlog cleared (2026-08-01 wave 6):**
- ✅ **#5 Vendor refund → vendor ledger** — receipts can now be typed `refund` and point at a vendor; a refund posts a **credit to that vendor's ledger** (reducing net paid) instead of faking client income. New `receipts.vendor_id`; a Transaction Type selector on the receipt form shows a vendor picker for refunds. _Verified: refund posts vendor/credit; excluded from income._
- ✅ **Client merge/dedup** — `/clients/:id/duplicates` + `/clients/:id/merge` + a "Review candidates" filter, mirroring vendors. _Verified: 100% match found, merged, source gone._
- ✅ **Open bank-statement file** — the statement detail has an "Open statement" button (authenticated viewer).
- ✅ **Inline client-create in reconcile** — the resolve-credit modal has a "+ New" button to create a client without leaving the page.
- ✅ **#9 Date parsing hardened** — ISO dates taken verbatim, numeric dates day-first (Indian), and the fallback uses **local** date parts (no UTC day-shift).

**Judged acceptable / deferred (low impact):**
- **#7 unknown Dr/Cr → debit** — only triggers when a statement has an Amount column with an unreadable Dr/Cr flag (rare; separate debit/credit columns are the norm). Such lines land as *unmatched* and the operator classifies them, so nothing is silently miscounted.
- **#8 dup-match heuristic** — the "duplicate" status is a *needs-review* signal (2+ candidates), which is the correct behaviour; reference match is preferred first.
- **#10 allocation→ledger** — **display-only**: split payments attribute correctly in all project reports (via the allocation views); only the single party-ledger line shows the primary project. Left as-is to avoid risking ledger integrity for a cosmetic gain.
- **#11 phantom advances** — effectively resolved by the Own-Accounts fix (bogus self-clients are no longer created); a genuine unlinked credit showing as a client advance is correct accounting.

---

---

## 🔴 #1 — Internal / own-account transfers are booked as income AND expense
**Your example: OD account → current account shows up as income.**

**What happens:** Reconciliation treats **every credit as a client receipt (income)** and **every debit as a vendor payment (expense)**. When you move money between your *own* accounts (OD → current, sweep, self-transfer), the receiving account's statement shows a credit → the system records a **receipt** (and even invents a "client" for your own company). If you also load the paying account's statement, the debit becomes a **payment** to a "vendor."

**Why (root cause):** `routes/reconciliation.routes.js` lines 89–95 and 166–214 branch purely on `line.debit > 0` / `line.credit > 0`. There is **no concept of "own bank accounts"** and **no "internal transfer" transaction type** anywhere in the schema (`schema.sql` — no `own_accounts` table, `payments`/`receipts` have no `kind` column).

**Impact:** Inflated income, inflated expense, wrong net position, wrong cashflow chart, fake client + fake vendor created, wrong client-revenue chart. This is the single biggest distortion.

**Fix:**
1. Add an **"Own Accounts"** master (a table of your own account numbers + names + which bank/OD/current).
2. Add a `kind` field to payments/receipts and bank lines: `income | expense | internal_transfer | financing | refund`.
3. In parse + import + match: if the counterparty account **or** name matches an own account → mark the line `internal_transfer`, **exclude it from income/expense**, do **not** create a client/vendor, and do **not** post to any party ledger (optionally post to a neutral "Bank Transfer / Contra" account so the two legs net to zero).
4. Dashboard sums then use `WHERE kind IN ('income'/'expense')` only.

---

## 🔴 #2 — Your own company / directors get created as "clients" and "vendors"
**Your example: "We are considering our own account as client."**

**What happens:** For any unrecognized credit, `findOrCreateClient` auto-creates a client from the beneficiary name; for any unrecognized debit, `findOrCreateVendor` auto-creates a vendor. Self-transfers, OD drawdowns, interest credits, tax refunds, and cash deposits therefore create **junk parties that are actually you**.

**Why (root cause):** `services/vendor-match.service.js` `findOrCreateClient` (line 110) and `findOrCreateVendor` (line 88) always create when no match — with no exclusion list. Called from `reconciliation.routes.js` `import-missing`.

**Impact:** Your own money movements show as customer revenue / supplier spend; receivables and payables both polluted.

**Fix:** Same **Own Accounts / own-names** list as #1, checked *before* create. Plus an option "don't auto-create — leave unassigned for me to tag" so unknown lines wait for the operator instead of manufacturing a party.

---

## 🔴 #3 — Duplicate screenshots / re-imports create duplicate payments (double-counting)
**Your example: "What if there are duplicate screenshots?"**

**What happens:** Upload the same payment screenshot twice (or re-upload last month's statement) and you get **two payments** for the same transaction — double expense, double ledger debit. Nothing checks for it.

**Why (root cause):**
- `POST /payments` (`payments.routes.js` line 55) inserts with **no dedup** on `reference_id`.
- `POST /receipts` — same.
- `import-missing` (`reconciliation.routes.js` line 156) re-imports unmatched lines with **no check** that a payment/receipt with that reference already exists.
- `reference_id` in the schema has only a **non-unique index** (`idx_payments_ref`), no unique constraint.

**Impact:** Silent double-counting — the most dangerous kind of error because the totals still "look" plausible.

**Fix:**
1. On `/payments/extract` and `/receipts/extract`, after reading the UTR, check for an existing non-deleted record with the same `reference_id` and **warn** ("This UTR already exists as payment #… on …").
2. On save, block or require explicit override when `reference_id` already exists (and is non-empty).
3. In `import-missing` / `matchLine`, treat a line whose reference already exists as **already recorded**, not a new import.
4. Consider a partial-unique index on `reference_id` where `reference_id IS NOT NULL AND is_deleted = FALSE`.

---

## 🟠 #4 — Vendor master fills with duplicates & wrong matches
**Your example: "Vendor master is not working properly."**

**What happens:** Two failure modes at once:
- **Over-creation:** every unrecognized beneficiary auto-creates a candidate vendor, so "SANJEEV KUMAR", "SANJEEV KUMAR SINGH", "MR SANJEEV" can become three vendors (when the account number isn't captured to dedupe them).
- **Over-matching:** the name threshold `0.34` with `word_similarity` is loose, so a short name ("RAM") can match the wrong fuller vendor ("SITA RAM ENTERPRISES"), silently attaching a payment to the wrong party.

**Why (root cause):** `vendor-match.service.js` — `NAME_THRESHOLD = 0.34` (line 9); `findOrCreateVendor` always creates on miss; no **merge** tool; `is_candidate` records are never surfaced for review; the same human can exist as both an **employee** and a **vendor** (`payments.routes.js` auto-creates employees; recon auto-creates vendors).

**Impact:** Unreliable vendor totals, split spend across duplicate vendors, mis-attributed payments.

**Fix:**
1. Raise/settle the name threshold and require account-number confirmation before auto-attaching on a weak name match; low-confidence name matches should be **suggestions the operator confirms**, not silent links.
2. Add a **"Candidates to review"** queue and a **Merge vendors** action (repoint payments + `vendor_accounts`, delete the dupe).
3. Cross-check new vendor names against employees (and vice-versa) and warn.

---

## 🟠 #5 — A vendor **refund** (money back from a supplier) is counted as client income
**What happens:** If a vendor returns money, the credit lands in your statement and is booked as a **receipt from a client** — inflating revenue and creating/attaching to a bogus client, instead of reducing that vendor's spend.

**Why:** Credits are hard-wired to the client/receipt path (`reconciliation.routes.js` line 194). No "refund from vendor" classification.

**Fix:** Add `refund` as a line/transaction kind; a refund credit should map to the **vendor** (debit reversal on the vendor ledger), not to a client, and should be **excluded from revenue**.

---

## 🟠 #6 — Loan / OD drawdowns and repayments are treated as operating income/expense
**What happens:** Drawing on the OD/loan shows as **income**; repaying it (and interest) shows as **expense**. These are financing, not operating cash flow, so profit and net-position readings are wrong.

**Why:** No `financing` classification; everything is income or expense (§7 of the guide).

**Fix:** Same `kind` field (#1). Tag financing lines; exclude from operating income/expense; optionally show a separate "Financing" section.

---

## 🟡 #7 — Unknown Dr/Cr defaults to **debit** (Excel/CSV)
**What happens:** In `splitAmount` (`reconciliation.service.js` line 245), a row whose Dr/Cr flag can't be read is **assumed to be a debit (expense)**. A misread credit becomes an expense.

**Fix:** Don't guess. Mark such lines `unmatched / needs-review` and make the operator classify them.

---

## 🟡 #8 — Reconciliation "duplicate" flag is fragile
**What happens:** `matchLine` flags a line `duplicate` when 2+ existing records share amount + date (±3 days). Two genuinely separate payments of the same round amount in the same week get wrongly flagged; meanwhile a true re-import with a *new* reference but same amount can silently match the **wrong** record. Reference matching is exact `ILIKE` only, so a trailing space or case/format change misses.

**Fix:** Prefer reference-based identity (normalized); use amount+date only as a weak hint that asks for confirmation; distinguish "possible duplicate" from "already recorded (same reference)."

---

## 🟡 #9 — Date parsing can flip day/month on ambiguous statements
**What happens:** The generic fallback `toISODate` (`reconciliation.service.js` line 19) reads `d/m/y`, but the JS `new Date(s)` fallback assumes US `m/d/y`. Ambiguous dates (e.g. `03/04/2026`) can land on the wrong month in the generic path.

**Fix:** Force DD/MM/YYYY for Indian statements (or read the statement's locale) and drop the `new Date()` fallback for bare numeric dates.

---

## 🟡 #10 — Allocation splits don't flow into the party ledger
**What happens:** A payment split across projects via `/allocations` updates only the allocation table; the **ledger entry still carries the single `project_id`** from the payment. So the vendor/client *ledger* attributes the whole amount to one project even though reports (which read the allocation views) split it. The two can disagree.

**Fix:** When allocations exist, post the ledger entry per-allocation (or make ledger project attribution read from allocations), so ledger and reports agree.

---

## 🟡 #11 — Auto-created receipts credit a client with no invoice → phantom "advances"
**What happens:** A credit imported from a statement posts a **credit to the client ledger** even when there's no invoice, so the client shows a negative outstanding (an "advance"). If the "client" is actually an own-account transfer (#1/#2), this quietly distorts receivables.

**Fix:** Follows from #1/#2 (don't create the bogus client). Separately, surface unlinked credits as "unapplied receipts" rather than silent advances.

---

## Suggested fix order
1. **#1 + #2 + #5 + #6 together** — introduce **Own Accounts** + a transaction **`kind`** (income / expense / internal_transfer / financing / refund). This one change fixes the biggest distortions and stops the bogus-party creation. _(Needs a few decisions from you — see below.)_
2. **#3** — duplicate-screenshot / re-import guard. Self-contained, high value, low risk.
3. **#4** — vendor candidate-review + merge tool + tighter matching.
4. **#7, #8, #9** — reconciliation robustness.
5. **#10, #11** — ledger/allocation and receivables cleanups.

### Decisions I need from you before building #1
- **List your own accounts** (the OD account, the current account(s), any others) — number + bank. That list is what lets the system recognise an internal transfer.
- For an internal transfer, do you want it **completely hidden** from income/expense, or shown in a separate **"Bank Transfers"** view (net zero)?
- Should loan/OD drawdown & repayment be their own **"Financing"** section, or just excluded?
