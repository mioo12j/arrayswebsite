# Rebranding Guide — making this ERP another company's

**Audience:** an engineer or AI assistant tasked with turning this software from **Arrays Ingenieria Private Limited (AIPL)** into a *different* company's ERP — new name, logo, colours, contact details, bank, leadership, everything.

**Read this whole file first, then work top-to-bottom through §7 (the checklist).** Nothing here changes behaviour — it only changes identity. Do it on a branch, rebuild, and generate one of every PDF to confirm before shipping.

> ⚠️ **The single biggest gotcha:** there are two `config/company.js` files that *look* like the single source of truth, but **the premium PDFs and several screens hardcode the brand separately and do NOT read those configs.** You must change both the configs *and* the hardcoded spots. This guide lists every one.

---

## 1. What "the brand" actually consists of

| Element | Current value (AIPL) |
|---|---|
| Legal name | ARRAYS INGENIERIA PRIVATE LIMITED |
| Short name | INGENIERIA |
| PDF name | ARRAYS INGENIERIA PVT LTD |
| Tagline / slogan | "Developing Green Energy for the Nation" · "Engineering Excellence in Renewable Energy" |
| Cover headline | "Solar Power Plant for a Brighter Nation" · "Engineered with military precision by Arrays Ingenieria" |
| Leadership | **Lt. Gen. A.R. Prasad (Retd) · AVSM · VSM · ADC · Ph.D** |
| Positioning | **Veteran-led / ex-servicemen / "military precision"** — a core theme, see §6 |
| Email / website | arraysingenieria@gmail.com · www.arraysingenieria.com |
| Address | A-027, NSG SAS LIMITED, KNOWLEDGE PARK-1, POCKET P-6, GREATER NOIDA, GAUTAM BUDDHA NAGAR, UTTAR PRADESH-201310 |
| GSTIN / PAN / CIN | 09AARCA4610L1ZC · AARCA4610L · U45309DL2018PTC340544 |
| Bank | IDBI Bank, A/c 0875102000012290, IFSC IBKL0000875, Greater Noida branch |
| Certifications | ISO 9001 / 14001 / 45001 (+ "India 5000" award) |
| Founded | "SINCE 2018" |
| Clients / track record | Tata Power Solar, Tata Steel, Tata Motors, DCM, Super Smelters, Jayshree Tea, Manjushree, YIAPL, etc. |
| Web UI accent | **blue** (`brand` palette `#2563eb`) |
| PDF palette | **emerald + gold** (`C.emer #0a6045`, `C.gold #b8860b`) |
| Logo & photos | `server/src/assets/brand/` + a web favicon |
| App title | "ARRAYS INGENIERIA — Renewable Energy ERP" |
| Package names | `ingenieria-erp*` |

Note the **two colour systems**: the React UI is blue; the client-facing PDFs are emerald/gold. They are independent — decide your new brand's UI accent and document accent separately.

---

## 2. The config files (change these first — but they're not enough)

Two near-identical files, meant as the source of truth. **Keep them in sync with each other.**

- **`server/src/config/company.js`** — used by invoice/Excel/GST exports and some API responses. Fields: `name`, `shortName`, `pdfName`, `subtitle`, `slogan`, `tagline`, `gstin`, `pan`, `cin`, `address`, `email`, `about`, `certifications[]`, `clients[]`, `bank{ name, accountHolder, accountNumber, ifsc, branch }`, `brandColor` (hex w/o `#`, used by export generators).
- **`client/src/config/company.js`** — used by the React UI. Same fields plus `brandLine` ("Renewable Energy ERP").

Change every field in both. **But** the premium proposal/quotation/BOQ PDFs and a few screens do **not** import these — continue to §3–§5.

---

## 3. The premium PDFs — hardcoded brand (the big one)

### 3.1 `server/src/services/proposal-pdf.service.js` (~20 brand refs — the proposal book, cover & thank-you)

This file is the visual heart. Change:

| What | Where |
|---|---|
| **PDF palette** `C` (emerald/gold/tri-tones) | top of file, `const C = { … }` — `emer`, `emerD`, `emerM`, `gold`, `goldB`, `sun/sky/navy/grn` (the logo tri-tones). Change to your brand colours; `PROPOSAL_BRAND = { M, C }` is exported and reused by the quotation/BOQ. |
| **Chrome header** company text | `chrome()` — `'ARRAYS INGENIERIA'` (top-right of every page) |
| **Chrome footer** slogan + contact | `chrome()` — `'Developing Green Energy for the Nation'` and `'ISO 9001 · 14001 · 45001 · arraysingenieria@gmail.com'` |
| **Cover** headline / eyebrow / credential pill | `coverPage()` — "Solar Power Plant for a Brighter Nation", "EX-SERVICEMEN LED · ISO… · SINCE 2018", "Engineered with military precision by Arrays Ingenieria" |
| **Leadership page** | `leadershipPage()` — **"Lt. Gen. A.R. Prasad"**, "(Retd)", the script signature "A.R. Prasad", "LT. GEN. A.R. PRASAD (RETD) · AVSM · VSM · ADC · Ph.D", the personal message |
| **About / Vision / Veteran Advantage** | `aboutPage()`, `whyPage()` — the "Ingeniería means engineering in Spanish", veteran founding story, vision statement |
| **Track record / clients / testimonials** | `trackRecordPage()`, `clientsPage()`, `testimonialsPage()` — the real project rows, client names, quotes (all AIPL-specific) |
| **Recognition / media** | `recognitionPage()` — President/PM/Raksha Mantri/DEFCOM honours, TV channels, newspaper clippings (all AIPL-specific — remove or replace) |
| **Certifications** | `qualityPage()` — ISO 9001/14001/45001 + "India 5000" |
| **Thank-you page** | `thankYouPage()` — "Arrays Ingenieria Pvt. Ltd.", "Ex-Servicemen Led · ISO… · Pan-India", "arraysingenieria@gmail.com", "www.arraysingenieria.com", "Developing Green Energy for the Nation" |
| **Image path builders** | `photo()/press()/cert()/news()` point into `assets/brand/*` — replace the asset files (§5) |

### 3.2 `server/src/services/quote-docs.service.js` (~11 refs — Commercial Quotation & BOQ)

| What | Where |
|---|---|
| **Bank details** printed on the quotation | `DEFAULT_BANK = { … }` near the top (IDBI, account, IFSC). This is **separate** from `config/company.js` — change it here too. |
| **Supplier default name** | `companyBankBlock()` — `data.company_name || 'Arrays Ingenieria Pvt. Ltd.'` |
| **Auto-gen footer note** | `autoGenNote()` — "produced by the Arrays Ingenieria system" |
| Header/footer chrome | inherited from `KIT` (proposal-pdf) — fixed once you change §3.1 |

### 3.3 `server/src/services/invoice-pdf.js` and `quote-pdf.service.js`

- `invoice-pdf.js` renders the running-account tax invoice — it largely reads `server/src/config/company.js`, but **verify** the letterhead, slogan and bank block after changing the config.
- `quote-pdf.service.js` is the **legacy** single-file quote PDF (the "Technical Quote (legacy)" option was removed from the UI but the route/file remain). It hardcodes some brand text; either update it or delete the route + file if unused.

### 3.4 GST documents

`server/src/services/gst/pdf.js` + `challan-pdf.js` render e-invoice/challan PDFs; they read `config/company.js` for the supplier block but confirm the letterhead after your change.

---

## 4. The React UI — hardcoded brand

| What | Where |
|---|---|
| **UI accent palette** (blue) | `client/tailwind.config.js` — `colors.brand.{50…900}`. Replace with your brand's accent scale. Everything using `brand-600` etc. follows automatically. |
| **App title** | `client/index.html` — `<title>ARRAYS INGENIERIA — Renewable Energy ERP</title>` |
| **Favicon** | `client/index.html` — `<link rel="icon" … href="/sun.svg">` → replace `client/public/sun.svg` |
| **Login screen brand** | `client/src/pages/Login.jsx` — "Financial Data AIPL" and any logo/wordmark |
| **Dashboard title** | `client/src/pages/Dashboard.jsx` — `title="Financial Data AIPL"` |
| **Help text** | `client/src/pages/Help.jsx` (~6 refs) — company name in the guide prose (EN + HI) |
| **Invoices screen** | `client/src/pages/Invoices.jsx` (~3 refs) — company name/slogan on the invoice preview |
| **GST compliance** | `client/src/pages/GstCompliance.jsx` — a brand mention |
| **QuoteBuilder** | `client/src/pages/QuoteBuilder.jsx` — the System-Config default placeholders and any "Arrays" text |
| Sidebar/header wordmark | `client/src/components/layout/*` — check for the logo/short name |

---

## 5. Brand assets (images & fonts)

**`server/src/assets/brand/`:**
- `logo-color.png`, `logo-white.png` — the mark used on the cover, chrome header and thank-you. Replace with the new logo (keep similar dimensions/aspect so layouts hold).
- `photos/` — `proj-*.jpg` project photography used across the proposal (capabilities, track record, savings, thank-you). Replace with the new company's photos or neutral stock.
- `press/` — `ceo-*.jpg` leadership/honours photos (AIPL-specific — replace or the pages that use them must be removed).
- `news/` — newspaper clippings (AIPL-specific — replace/remove).
- `certs/` — certification badges.

**`client/public/`** — the web favicon (`sun.svg`).

**Fonts** (`server/src/assets/fonts/`) are typography, not brand — keep unless the new brand mandates specific fonts (then re-register in `registerFonts()` in `proposal-pdf.service.js`).

---

## 6. ⚠️ The veteran / military positioning (don't miss this)

This company is **veteran-led**, and that theme runs through the whole proposal: "Ex-Servicemen Led", "military precision", "The Veteran Advantage" page, a serving-officer CEO with military honours (AVSM/VSM/ADC), and photos with national leaders. **For a non-veteran company this framing is false and must be rewritten, not just renamed.** Specifically:
- Rewrite/remove the **Veteran Advantage** page (`whyPage()`), the **Leadership** page's military bio (`leadershipPage()`), and the "military precision" cover line.
- Remove/replace the **Recognition & Media** page (President/PM honours, newspaper clippings) unless the new company genuinely has equivalents.
- Recheck the **Track record / clients / testimonials** — these are AIPL's real projects; replace with the new company's or remove.

Treat every claim as a factual statement about the new company — only keep what is true for them.

---

## 7. Step-by-step checklist

1. **Branch:** `git checkout -b rebrand/<newco>`.
2. **Configs:** update `server/src/config/company.js` **and** `client/src/config/company.js` (§2) — every field, kept identical.
3. **Bank:** update `DEFAULT_BANK` in `quote-docs.service.js` (§3.2) to match.
4. **PDF palette:** change `C` in `proposal-pdf.service.js` (§3.1) to the new document colours.
5. **PDF text:** work through every hardcoded string in `proposal-pdf.service.js` and `quote-docs.service.js` (§3.1–3.2) — header, footer, cover, leadership, about, track record, testimonials, recognition, thank-you.
6. **Positioning:** rewrite/remove the veteran/military content (§6).
7. **Assets:** replace `server/src/assets/brand/*` and `client/public/sun.svg` (§5).
8. **UI accent:** change `client/tailwind.config.js` `brand` palette (§4).
9. **UI text:** app title, Login, Dashboard, Help, Invoices, GstCompliance, QuoteBuilder (§4).
10. **Package names** (optional): `name` in the three `package.json` files.
11. **Seed / demo data** (if reusing): `server/src/db/seed.js`, `gst-demo.js`, `import-company.js` carry the company name — update or reseed for the new entity.
12. **Rebuild & verify:** `npm run build --prefix client`; restart the server; then generate **one of every PDF** (proposal, commercial quotation, BOQ, complete package, invoice, challan) and read them — confirm no "Arrays / Ingenieria / Prasad / IDBI / veteran" text or old colours remain.
13. **Grep sweep** (the safety net):
    ```bash
    grep -rniE "arrays|ingenieria|aipl|prasad|IBKL0000875|0875102000012290|arraysingenieria|Developing Green Energy|veteran|ex-servicemen|military precision" server/src client/src client/index.html --include=*.js --include=*.jsx --include=*.sql --include=*.html
    ```
    Every hit must be intentional. Also sweep the GSTIN/PAN/CIN (`09AARCA4610L1ZC`, `AARCA4610L`, `U45309DL2018PTC340544`).

---

## 8. Quick file index (where the brand lives)

```
server/src/config/company.js              legal identity, bank, certs, clients (source of truth #1)
client/src/config/company.js              same, for the UI (source of truth #2)
server/src/services/proposal-pdf.service.js  ★ palette C + cover/leadership/about/thank-you/track-record (most brand text)
server/src/services/quote-docs.service.js    ★ DEFAULT_BANK + supplier default + footer
server/src/services/invoice-pdf.js           invoice letterhead (reads config — verify)
server/src/services/quote-pdf.service.js      legacy quote PDF (hardcoded; remove if unused)
server/src/services/gst/pdf.js, challan-pdf.js  GST/challan letterheads (read config — verify)
server/src/assets/brand/                      logo-color/white.png, photos/, press/, news/, certs/
client/tailwind.config.js                     UI accent palette (brand.*)
client/index.html                             <title> + favicon link
client/public/sun.svg                         favicon asset
client/src/pages/Login.jsx, Dashboard.jsx     "Financial Data AIPL"
client/src/pages/Help.jsx, Invoices.jsx, GstCompliance.jsx, QuoteBuilder.jsx  brand text
server/src/db/seed.js, gst-demo.js, import-company.js  seeded company data
package.json (×3)                             "ingenieria-erp*" package names
docs/*                                        these docs reference AIPL — update if shipping to the new owner
```

---

*Keep this guide accurate: if you add a new place that prints the company name, logo or colours, add it here.*
