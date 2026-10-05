// ============================================================================
//  OCR & Extraction Engine
//  - Images  -> tesseract.js
//  - PDFs    -> pdf-parse (embedded text); falls back gracefully
//  Then a heuristic parser pulls structured fields out of the raw text:
//  reference id, amount, date, beneficiary, remarks, payment mode, network.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);

/** Run raw text extraction for a file on disk. */
export async function extractText(filePath, mimeType = '') {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.pdf' || mimeType === 'application/pdf') {
      return await extractPdf(filePath);
    }
    if (IMAGE_EXT.has(ext) || mimeType.startsWith('image/')) {
      return await extractImage(filePath);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ocr] extraction failed:', err.message);
  }
  return '';
}

async function extractPdf(filePath) {
  // Parse in-process with the modern, stateless pdfjs-dist. (Earlier we spawned a
  // child process to isolate pdf-parse's buggy old pdf.js, but pdfjs-dist is
  // stateless per getDocument — so in-process is safe and uses far less memory,
  // which matters on small cloud instances like Render's 512 MB free tier.)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY = null;
    for (const item of content.items) {
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) out += '\n';
      else if (out && !out.endsWith('\n')) out += ' ';
      out += item.str;
      lastY = y;
    }
    out += '\n';
  }
  try { await doc.cleanup(); await doc.destroy(); } catch { /* ignore */ }
  return out;
}

async function extractImage(filePath) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(filePath);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

// ── Field parsing ──────────────────────────────────────────────────────────

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function toISODate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  // dd/mm/yyyy or dd-mm-yyyy
  let m = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // dd Mon yyyy   /  Mon dd, yyyy
  m = s.match(/\b(\d{1,2})\s*([A-Za-z]{3,})\.?\s*,?\s*(\d{2,4})\b/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    let [, d, mon, y] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${String(MONTHS[mon.slice(0, 3).toLowerCase()]).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = s.match(/\b([A-Za-z]{3,})\.?\s+(\d{1,2})\s*,?\s*(\d{2,4})\b/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    let [, mon, d, y] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${String(MONTHS[mon.slice(0, 3).toLowerCase()]).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

// Field labels — used to know where one value ends when a statement/screenshot
// bleeds two columns onto one OCR line.
const FIELD_LABELS = /(reference\s*id|ref\.?\s*id|from\s*account|to\s*account|amount|payment\s*type|payment\s*date|value\s*date|network|transaction\s*status|status|remarks?|narration|beneficiary|payee|utr|ifsc|a\/c|account)/i;

function cutAtLabel(s) {
  if (!s) return null;
  let out = String(s).trim();
  const idx = out.slice(1).search(FIELD_LABELS);
  if (idx >= 0) out = out.slice(0, idx + 1);
  return out.replace(/[\s:|_-]+$/, '').trim() || null;
}

// In a two-column screenshot, a right-column field (e.g. "Network: NEFT") can be
// OCR-read in the MIDDLE of a wrapped remark. This removes those bleed segments
// (each requires a recognizable value, to avoid deleting real remark words) while
// preserving the original word order of the remark.
function stripColumnBleed(s) {
  if (!s) return null;
  const out = (' ' + String(s) + ' ')
    .replace(/\bnetwork\s*:?\s*(?:neft|rtgs|imps|upi)\b/ig, ' ')
    .replace(/\bpayment\s*type\s*:?\s*(?:one\s*time|recurring|immediate|scheduled)\b/ig, ' ')
    .replace(/\btransaction\s*status\s*:?\s*(?:success|failed|pending|processed)\b/ig, ' ')
    .replace(/\bfrom\s*account\s*:?\s*[\dXx*]{6,}/ig, ' ')
    .replace(/\bpayment\s*date\s*:?\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/ig, ' ')
    .replace(/\bamount\s*:?\s*(?:inr|rs\.?|₹)?\s*[\d,]+\.\d{2}/ig, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out || null;
}

// Capture a labelled NAME (e.g. "To Account: SANJEEV KUMAR SINGH" then "NIPPU"
// on the next line). Trims any two-column bleed on the label line, then appends
// following wrapped lines that look like name text, stopping at the next field
// label or a numeric/account line. Returns null if the value is just a number.
function multilineName(lines, labelRe) {
  const idx = lines.findIndex((l) => labelRe.test(l));
  if (idx < 0) return null;
  let head = lines[idx].replace(new RegExp(`^.*?${labelRe.source}\\s*[:\\-]?\\s*`, 'i'), '');
  head = cutAtLabel(head) || '';
  const parts = head ? [head] : [];
  for (let i = idx + 1; i < Math.min(lines.length, idx + 3); i++) {
    const ln = (lines[i] || '').trim();
    if (!ln || FIELD_LABELS.test(ln)) break;   // next field reached
    if (!/[A-Za-z]/.test(ln) || /\d{5,}/.test(ln)) break; // not a name continuation
    parts.push(cutAtLabel(ln) || ln);
  }
  const name = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!name || /^[\dXx*\s.-]+$/.test(name)) return null; // pure number → not a name
  return name;
}

// Capture a labelled value that may continue onto following (wrapped) lines.
function multilineValue(lines, labelRe) {
  const idx = lines.findIndex((l) => labelRe.test(l));
  if (idx < 0) return null;
  const head = lines[idx].replace(new RegExp(`^.*?${labelRe.source}\\s*[:\\-]?\\s*`, 'i'), '');
  const parts = head ? [head] : [];
  for (let i = idx + 1; i < Math.min(lines.length, idx + 4); i++) {
    const ln = lines[i];
    if (!ln || FIELD_LABELS.test(ln)) break; // stop at the next field
    parts.push(ln);
  }
  return parts.join(' ').trim() || null;
}

/**
 * Parse structured payment fields from raw OCR/PDF text.
 * Returns best-effort values; the operator verifies/corrects them in the UI.
 */
export function parsePaymentFields(text) {
  const t = (text || '').replace(/ /g, ' ');

  // Transaction status — so a FAILED / PENDING payment is not silently booked as
  // successful. success | failed | pending | null (unknown).
  let status = null;
  if (/\b(failed|failure|declined|unsuccessful|rejected|not\s*successful|cancell?ed)\b/i.test(t)) status = 'failed';
  else if (/\b(pending|processing|in\s*progress|awaited|initiated)\b/i.test(t)) status = 'pending';
  else if (/\b(success(?:ful)?|completed|credited|transaction\s*successful|payment\s*successful)\b/i.test(t)) status = 'success';

  // Amount: prefer a value tied to an amount label, then a currency-prefixed
  // value; take the LARGEST money-formatted number as a final fallback (so an
  // account tail or a date is never mistaken for the amount).
  let amount = null;
  const amtMatch =
    t.match(/(?:amount\s*paid|transaction\s*amount|you\s*(?:paid|sent)|amount|amt|paid|total|debited)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*\.[0-9]{2})/i) ||
    t.match(/(?:₹|rs\.?|inr)\s*([0-9][0-9,]*\.?[0-9]{0,2})/i) ||
    t.match(/(?:amount|amt|paid|total)\s*[:\-]?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i);
  if (amtMatch) amount = Number(amtMatch[1].replace(/,/g, ''));
  if (!amount) {
    const nums = (t.match(/\b\d[\d,]*\.\d{2}\b/g) || []).map((n) => Number(n.replace(/,/g, ''))).filter((n) => n > 0);
    if (nums.length) amount = Math.max(...nums);
  }

  // Reference / UTR / Ref. ID — bank UTR/RRN, generic txn ids, and the UPI
  // ecosystem (UPI ref no, Google/PhonePe/Paytm ids, bare 12-digit UPI ref).
  // A separator after the label avoids capturing the word "reference" from prose.
  const reference = firstMatch(t, [
    /\b(?:utr|rrn)\b\s*(?:no\.?|number)?\s*[:\-]?\s*\[?([A-Za-z0-9]{6,30})\]?/i,
    /\bupi\s*(?:ref(?:erence)?|transaction)\s*(?:id|no\.?|number)?\s*[:\-]?\s*\[?([A-Za-z0-9]{6,30})\]?/i,
    /\b(?:google|phonepe|paytm|gpay|bhim)\s*(?:transaction|txn|upi)?\s*(?:id|no\.?)?\s*[:\-]?\s*\[?([A-Za-z0-9]{8,30})\]?/i,
    /\bref(?:erence|\.)?\s*(?:id|no\.?|number)?\s*[:\-]\s*\[?([A-Za-z0-9]{6,30})\]?/i,
    /\b(?:txn|transaction)\s*(?:id|no\.?|number|reference)?\s*[:\-]\s*\[?([A-Za-z0-9]{6,30})\]?/i,
    /\b([A-Z]{2,6}\d{8,20})\b/,
    /\b(\d{12})\b/,
  ]);

  // Date
  const dateMatch = firstMatch(t, [
    /\b(?:date|on|dated|value\s*date)\s*[:\-]?\s*([0-9A-Za-z\/\-.,\s]{6,20})/i,
  ]);
  const paymentDate = toISODate(dateMatch) || toISODate(t);

  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Beneficiary = the "To Account" holder name (NOT "From Account" = sender).
  // Use the multi-line capture so wrapped names (e.g. "SANJEEV KUMAR SINGH" then
  // "NIPPU") are kept in full.
  let beneficiary = multilineName(lines, /\b(?:to\s*account|beneficiary(?:\s*name)?|payee(?:\s*name)?|credited\s*to|paid\s*to)\b/i)
    || cutAtLabel(firstMatch(t, [
      /\bto\s*account\s*[:\-]?\s*([A-Za-z][^\n]{1,60})/i,
      /\b(?:beneficiary(?:\s*name)?|payee\s*name|payee|credited\s*to|paid\s*to)\s*[:\-]?\s*([A-Za-z][^\n]{1,60})/i,
    ]));

  // If "To Account" held a NUMBER, that's the beneficiary account (not a name).
  let toAccountNo = null;
  const toAcctRaw = firstMatch(t, [/\bto\s*account\s*[:\-]?\s*([Xx*\d][\dXx*\s-]{8,25})/i]);
  if (toAcctRaw && /\d{9,}/.test(toAcctRaw.replace(/\s/g, ''))) {
    toAccountNo = toAcctRaw.replace(/[\s-]/g, '');
    if (beneficiary && /^[\dXx*\s-]+$/.test(beneficiary)) beneficiary = null;
  }

  // Account details = the BENEFICIARY account only. Never "From Account"
  // (that is the sender's own account number).
  const account = toAccountNo || firstMatch(t, [
    /\b(?:beneficiary|credit|payee)\s*(?:a\/c|acc(?:ount)?)\s*(?:no\.?|number)?\s*[:\-]?\s*([Xx*\d]{9,20})/i,
  ]);

  // Network / mode
  let network = null;
  if (/\brtgs\b/i.test(t)) network = 'RTGS';
  else if (/\bneft\b/i.test(t)) network = 'NEFT';
  else if (/\bimps\b/i.test(t)) network = 'IMPS';
  else if (/\bupi\b/i.test(t)) network = 'UPI';

  // A UPI VPA (name@bank) is a useful beneficiary/account hint when no bank
  // account number is present (common in GPay/PhonePe screenshots).
  const vpa = (t.match(/\b([a-z0-9._-]{2,}@[a-z]{2,})\b/i) || [])[1] || null;
  if (vpa && !network) network = 'UPI';

  const modeMap = { RTGS: 'rtgs', NEFT: 'neft', IMPS: 'imps', UPI: 'upi' };
  const paymentMode = network ? modeMap[network] : null;

  // Remarks / narration — captured in FULL, including wrapped continuation lines
  // (e.g. a remark that spills onto a second/third line in the screenshot).
  const remarks = stripColumnBleed(multilineValue(lines, /(?:remarks?|narration|description|purpose|note)/i))
    || cutAtLabel(firstMatch(t, [/\b(?:upi\s*ref(?:erence)?(?:\s*(?:id|no))?)\s*[:\-]?\s*([A-Za-z0-9 .,&'/_-]{3,60})/i]));

  return {
    reference_id: reference,
    amount,
    payment_date: paymentDate,
    beneficiary_name: beneficiary,
    account_details: account || vpa,
    network_type: network,
    payment_mode: paymentMode,
    bank_remarks: remarks,
    status,
    upi_vpa: vpa,
  };
}

/** Parse fields from an uploaded invoice (PDF/scan/Excel-as-text). */
export function parseInvoiceFields(text) {
  const t = (text || '').replace(/ /g, ' ');
  const numFrom = (re) => {
    const m = t.match(re);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };
  const invoice_number = firstMatch(t, [
    // Require a separator (: # - or the words no/number) so we don't capture the
    // bare word "INVOICE" from a heading like "TAX INVOICE".
    /\b(?:invoice|inv|bill)\s*(?:no\.?|number|#)?\s*[:#\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-]{2,29})/i,
    /\b(?:invoice|inv|bill)\s*(?:no\.?|number|#)\s+([A-Za-z0-9][A-Za-z0-9\/\-]{2,29})/i,
  ]);
  const dateRaw = firstMatch(t, [
    /\b(?:invoice\s*date|date|dated)\s*[:\-]?\s*([0-9A-Za-z\/\-.,\s]{6,20})/i,
  ]);
  const taxable = numFrom(/\b(?:taxable(?:\s*value| amount)?|sub\s*total|basic)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i);
  const gst = numFrom(/\b(?:gst|igst|cgst\s*\+?\s*sgst|tax)\s*(?:amount)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i);
  const total = numFrom(/\b(?:grand\s*total|total\s*(?:amount|payable|invoice value)|net\s*payable|total)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*\.?[0-9]{0,2})/i);
  return {
    invoice_number,
    issue_date: toISODate(dateRaw) || toISODate(t),
    taxable_amount: taxable,
    gst_amount: gst,
    total_amount: total,
  };
}

/** Parse fields relevant to an incoming credit/receipt. */
export function parseReceiptFields(text) {
  const base = parsePaymentFields(text);
  return {
    reference_id: base.reference_id,
    credited_amount: base.amount,
    credited_date: base.payment_date,
    account_details: base.account_details,
    status: base.status,
  };
}
