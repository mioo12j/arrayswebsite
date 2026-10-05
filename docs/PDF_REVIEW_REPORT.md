# PDF Quality & Formatting Review — Compliance Documents

**Phase:** Dedicated PDF stabilization (no new features).
**Scope:** e-Invoice PDF, e-Way Bill PDF, Quotation PDF (benchmark), shared engine.
**Engine:** `server/src/services/gst/pdf.js`, `server/src/services/quote-pdf.service.js`
**Method:** Engine rewrite to the quotation benchmark + automated **page-count stress test**
(`scripts/pdf-stress.js`) and **coordinate-level layout verification** via `pdfjs-dist`
(`scripts/pdf-verify.js`). Both reproducible.

---

## 1. Issues found

| # | Severity | Document | Issue |
|---|----------|----------|-------|
| 1 | **Critical** | All (incl. quotation) | **Footer drawn inside the bottom margin band** caused pdfkit to auto-paginate every footer line → a 1-item invoice produced **4 pages**, EWB **5 pages**; cascading blank pages. This is the "unnecessary multiple pages" defect. |
| 2 | **High** | All | **₹ rendered as "¹"** — pdfkit's standard Helvetica (WinAnsi) has no Indian-Rupee glyph, so every amount printed superscript-one instead of the rupee sign. |
| 3 | Medium | e-Invoice | **Item table column widths** too narrow: 8-digit HSN wrapped (`854140`+`11`), `GST%` header lost its `%`, Total amount dropped a digit to the next line. |
| 4 | Medium | e-Way Bill | Part A / Part B were `\n`-joined text lists with **no label/value alignment** — the weakest, least readable document. |
| 5 | Medium | e-Invoice | Trailing **declaration / terms used unconstrained text()** → could auto-paginate into a near-empty page. |
| 6 | Low | All | **Logo forced to a square** (`width:42,height:42,fit:[42,42]`) → non-square logos distorted. |
| 7 | Low | All | Inconsistent spacing/typography vs the quotation benchmark; no shared layout model. |

---

## 2. Fixes applied

1. **Footer locking (root-cause fix).** `finalize()` and the quotation footer now set `doc.page.margins.bottom = 0` before painting the footer band, so footer text in the margin never triggers pagination. Footers + page numbers are painted once across all buffered pages → **identical header/footer on every page**.
2. **Currency.** `inr()` now emits `Rs ` (ASCII) in both PDF services — renders correctly on every platform (local Windows and Linux/Render), no font embedding required.
3. **Item table.** Rebalanced e-Invoice columns (HSN 0.09, GST% 0.06, Taxable 0.13, Tax 0.12, Total 0.15…) — verified that 8-digit HSN, `GST%`, and amounts up to `Rs 13,57,000.00` render fully on one line; long descriptions ellipsis-clip cleanly.
4. **e-Way Bill redesign.** New `infoPanel()` renders Part A (Document / Value & Distance) and Part B (Conveyance / Transporter) as **aligned two-column label/value panels**, colour-coded by completeness, with a **status chip** (ACTIVE / EXPIRED / CANCELLED / CLOSED / DRAFT) and clean validity dates.
5. **One-page model.** Single content flow governed by `bottomLimit()` + explicit block-fit guards; trailing declaration/terms are **height-capped** (`{ height, ellipsis: true }`) so they can never spawn a page. HSN + tax summary kept together as one block.
6. **Image rendering.** New `fitImage()` uses `fit` only with center alignment → **aspect ratio always preserved** (logo, signature, stamp never stretch). Signature/stamp strip is bottom-anchored so it stays above the footer.
7. **Consistency.** Shared constants (margin, colours, header/footer heights), `sectionBar()`, `partyBlock()`, and table styling matched to the quotation benchmark across both documents.

---

## 3. Pagination test results (`scripts/pdf-stress.js`)

| Document | 1 | 5 | 10 | 20 | 50 | 100 | Long-text | DRAFT |
|----------|---|---|----|----|----|-----|-----------|-------|
| **e-Invoice** | **1** | **1** | **1** | **1** | 2 | 3 | **1** | **1** |
| **e-Way Bill** | **1** | **1** | **1** | **1** | 2 | 3 | **1** | **1** |

✓ Every small/medium document is **one page**. Multi-page counts are proportional to item volume only (no blank or near-empty pages). Before the fix these same documents were 4–5+ pages.

## 4. Layout verification results (`scripts/pdf-verify.js`, coordinate-level)

Both documents pass all invariants:
- ✓ Header band at the top (y < 70), company block aligned.
- ✓ `Page X of Y` present; footer below the content line.
- ✓ **No stray content below the footer line.**
- ✓ Required elements present & positioned: IRN / Ack No / Ack Date / QR, SUPPLIER + RECIPIENT side-by-side, item table, HSN summary, Total Invoice Value, Authorised Signatory; EWB number + status + Part A + Part B + From/To + Transporter.
- ✓ Item rows render every column on a single line (HSN, GST%, all amounts) — no wrapping fragments.

## 5. Print quality

- A4, 40 pt margins, all content within printable area; footer reserved band (46 pt).
- QR generated at 160 px source, drawn at 52 px — scannable in print.
- `Rs `-prefixed amounts and Helvetica are black-and-white safe.
- Watermark is faint (6% opacity), diagonal, and **does not** add pages or shift the text cursor.

## 6. Branding image guidance (Branding Manager UI)

Each asset slot now shows **recommended dimensions** (Logo 1200×1200, Signature 1200×400, Stamp 1200×1200), **format** (PNG, transparent), **max 3 MB**, and "aspect ratio preserved." Uploads are validated client-side for type, size, resolution and aspect ratio, with a **warning prompt** before saving an unsuitable image.

## 7. Remaining warnings / notes

- **Screenshots:** this environment has no PDF rasterizer (no Ghostscript/Poppler/canvas), so visual screenshots could not be auto-generated. Verification was done at the **text-coordinate level** (rigorous for layout/pagination) plus the in-app **Preview Invoice / Preview EWB** buttons for visual confirmation.
- **₹ symbol:** intentionally rendered as `Rs ` for cross-platform safety. If the true ₹ glyph is required, bundle a Unicode TTF (e.g. Noto Sans) under `server/assets/fonts` and register it with `doc.registerFont(...)`; the rest of the engine is unaffected.
- Reports / exported reports use the separate report exporter (xlsx/csv/json) and were out of scope for this visual-PDF pass.

**Status: PDF subsystem is production-ready.** e-Invoice and e-Way Bill now match or exceed the quotation benchmark for spacing, alignment, pagination and branding.
