# Error Code Reference

A library of the errors the platform can surface, with **cause** and **resolution**.
Validation codes (`EINV_*`, `EWB_*`) are returned by the GST validation engine and
shown inline on the document before submission.

For each: **Symptoms → Cause → Resolution → Prevention.**

---

## Authentication & access (AUTH / SEC)

| Code | Meaning | Cause | Resolution |
|---|---|---|---|
| `AUTH-001` | Authentication required (HTTP 401) | No/expired token | Log in again. |
| `AUTH-002` | Invalid or expired token (401) | Session expired | Log in again. |
| `AUTH-003` | Permission denied (403) | Role lacks the permission (e.g. operator submitting/cancelling) | Ask a checker (Admin); see maker-checker. |
| `SEC-428` | Security verification required (428) | Critical action without 2-step verification | Complete password + email-code verification. |
| `SEC-401` | Incorrect password / code (401) | Wrong password or OTP | Re-enter; after max attempts the request locks — start again. |
| `SEC-423` | Locked (423) | Too many wrong codes | Wait/restart the verification. |
| `SVC-503` | System under maintenance (503) | Maintenance mode on | Wait, or sign in as an administrator. |
| `SVC-423` | Read-only mode (423) | Read-only mode on | Changes are temporarily disabled. |

## e-Invoice validation (EINV)

| Code | Cause | Resolution |
|---|---|---|
| `EINV_SUPTYP` | Missing/invalid supply type | Choose B2B/SEZWP/… |
| `EINV_DOCTYP` | Doc type not INV/CRN/DBN | Pick a valid type |
| `EINV_DOCNO` | Document number missing | Enter a number (or leave blank to auto-number) |
| `EINV_DOCNO_LEN` | Number > 16 chars | Shorten the number / reduce series padding |
| `EINV_DOCNO_FMT` / `EINV_DOCNO_START` | Bad characters / starts with 0,/,- | Use letters, digits, `/`, `-`; don't start with 0,/,- |
| `EINV_DOCDT` / `EINV_DOCDT_FUT` | Date missing / in the future | Enter today or a past date |
| `EINV_IRN_PRESENT` | IRN supplied in request | Do not pass an IRN — the IRP generates it |
| `EINV_SELLER_GSTIN` / `EINV_BUYER_GSTIN` | Invalid GSTIN (format/check-digit) | Use the **Check** button; fix the GSTIN |
| `EINV_SELLER_STMATCH` | GSTIN state ≠ state code | Make the state code match the GSTIN |
| `EINV_*_PIN` | Pincode not 6 digits | Enter a valid pincode |
| `EINV_BUYER_POS` | Invalid place of supply | Enter a valid state code |
| `EINV_ITEM_MIN` / `EINV_ITEM_MAX` | 0 items / >1000 | 1–1000 line items |
| `EINV_IT_HSN` | Bad HSN (or 4-digit for >₹5 cr) | Use 4/6/8-digit HSN; 6-digit if turnover > ₹5 cr |
| `EINV_IT_QTY` / `EINV_IT_UNIT` | Goods missing qty / bad UQC | Add quantity; use a valid unit |
| `EINV_IT_RATE` | Invalid GST rate | Use 0/5/12/18/28 etc. |
| `EINV_VAL_RECON` (warning) | Item totals ≠ invoice total | Verify the values |

## e-Way Bill validation (EWB)

| Code | Cause | Resolution |
|---|---|---|
| `EWB_SUPTYP` / `EWB_SUBTYP` | Bad supply / sub-supply type | Pick valid values; describe "Others" |
| `EWB_DOCTYP` / `EWB_DOCNO` / `EWB_DOCDT` | Bad doc type/number/date | Fix the document details |
| `EWB_SHIPTO` | Ship-To GSTIN missing (Bill-To Ship-To) | Provide the Ship-To GSTIN |
| `EWB_FROM_*` / `EWB_TO_*` | Bad from/to GSTIN/pincode/state | Correct the party details |
| `EWB_INVVAL` | Invoice value ≤ 0 | Enter the value |
| `EWB_DIST` | Distance out of 0–4000 km | Enter a valid distance (0 = auto) |
| `EWB_MODE_REQ` / `EWB_VEH_REQ` / `EWB_VEH_FMT` | Road needs a valid vehicle no. | Enter a valid vehicle number |
| `EWB_TDOC_NO` / `EWB_TDOC_DT` | Rail/air/ship need a transport doc | Enter transport doc no. + date |
| `EWB_IT_HSN` / `EWB_IT_TAX` | Bad HSN / taxable amount | Fix the item |

## PDF (PDF)

| Code | Symptom | Cause | Resolution |
|---|---|---|---|
| `PDF-001` | PDF won't open / 404 | Document not found or not downloadable | Refresh; ensure the record exists |
| `PDF-002` | Missing logo/signature/stamp | Image file removed from `uploads/` | Re-upload in Branding Manager |
| `PDF-003` | Header/footer/watermark off | Stale build | Rebuild the client; clear cache |

*(Pagination, header/footer repeat and watermark are validated by the stress test — large item lists paginate cleanly.)*

## Import (IMPORT)

| Code | Cause | Resolution |
|---|---|---|
| `IMPORT-001` | Could not parse | Check CSV header row / JSON array |
| `IMPORT-002` | Row validation failed | Fix flagged fields (name, GSTIN, email) |
| `IMPORT-003` | Duplicate records | Use skip-invalid; de-dupe source |

## Backup & restore (BACKUP)

| Code | Cause | Resolution |
|---|---|---|
| `BACKUP-001` | Backup file missing (410) | File deleted from `server/backups/` |
| `BACKUP-002` | Verification failed | Corrupt zip — take a fresh backup |
| `BACKUP-003` | Restore needs verification (428) | Complete 2-step verification |

## Portal / adapter (GST)

| Code | Cause | Resolution |
|---|---|---|
| `GST-001` | IRP rejected (502) | Portal validation failed — read the message, fix, resubmit |
| `GST-002` | EWB portal rejected (502) | Fix transport/party data, regenerate |
| `LIVE_NOT_CONFIGURED` | Live mode without credentials | Set GSP credentials in **Integrations**, or use Simulation |
