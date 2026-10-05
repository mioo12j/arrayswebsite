// ============================================================================
//  Bank Statement Reconciliation
//  Parses an uploaded statement (PDF text, Excel, or CSV) into transaction
//  lines, then matches each line against existing payments (debits) and
//  receipts (credits) by reference id and/or amount+date proximity.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx'; // SheetJS — reads both legacy .xls and modern .xlsx
import { extractText } from './ocr.service.js';
import { parseNarration, reconstructName } from './narration.service.js';

const NUM = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[₹, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function toISODate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Already ISO (YYYY-MM-DD) — take the date part verbatim (no timezone shift).
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Numeric DD/MM/YY(YY) — Indian bank convention is day-first.
  const m = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // Fallback (e.g. an Excel Date object): use LOCAL date parts, never toISOString
  // (which converts to UTC and can shift the day back for IST).
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

// Attach IDBI-style structured fields (mode/reference/account/beneficiary) to a
// parsed line, without clobbering values already read from dedicated columns.
function enrich(line) {
  const n = parseNarration(line.description);
  return {
    ...line,
    mode: line.mode || n.mode || null,
    reference_id: line.reference_id || n.reference_id || null,
    account_number: line.account_number || n.account_number || null,
    beneficiary: line.beneficiary || n.beneficiary || null,
  };
}

/** Parse a statement file into an array of normalized, structured lines. */
export async function parseStatement(filePath, mimeType = '') {
  const ext = path.extname(filePath).toLowerCase();
  let lines;
  if (ext === '.xlsx' || ext === '.xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    lines = await parseExcel(filePath);
  } else if (ext === '.csv' || mimeType === 'text/csv') {
    lines = parseCsv(fs.readFileSync(filePath, 'utf8'));
  } else {
    // PDF / scanned image / exported statement: extract text then parse rows.
    const text = await extractText(filePath, mimeType);
    // 1) IDBI "Statement of Transaction" tabular layout (Date | Particulars |
    //    Withdrawals | Deposits | Balance, DD-MM-YYYY dates, wrapped narration).
    const tabular = /withdrawals?\b/i.test(text) && /deposits?\b/i.test(text) ? parseIdbiTabular(text) : [];
    // 2) IDBI "OpTransactionHistory" tail layout (Dr/Cr + INR + timestamp + serial).
    // 3) Generic fallback.
    if (tabular.length) lines = tabular;
    else if (looksLikeIdbi(text)) lines = parseIdbiBlocks(text);
    else lines = parseTextLines(text);
  }
  return lines.map(enrich);
}

// ── IDBI "Statement of Transaction" tabular parser ──────────────────────────
// Each transaction begins on a line that starts with a DD-MM-YYYY date and ends
// with three money columns (Withdrawals  Deposits  Balance) and a Cr/Dr marker.
// The narration wraps onto following lines that carry no date/amounts; those are
// appended (page headers/footers are skipped). Rows with no money movement
// (e.g. the opening "B/F" balance line) are dropped.
const TAB_DATE_START = /^(\d{1,2}-\d{1,2}-\d{2,4})\s*/;
const TAB_AMOUNTS = /(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s*(Cr|Dr)\.?\s*$/i;
const TAB_SKIP = /^(Chq\.?\s*no|Date\b|Particulars|Customer\s*ID|Summary of|Account\s*(Number|Type)|Statement of|A\/c\s*Name|Monthly Average|Page\b|UNQ\s*SRL|GSTIN|SAC\s*Code|Closing Balance|Opening Balance|Balance\b|Withdrawals|Deposits|^\d{10,})/i;
export function parseIdbiTabular(text) {
  const rows = String(text || '').split(/\r?\n/).map((l) => l.replace(/ /g, ' ').trim());
  const out = [];
  let date = null, desc = [];
  for (const raw of rows) {
    if (!raw) continue;
    let work = raw;
    const dm = work.match(TAB_DATE_START);
    if (dm) { date = dm[1]; desc = []; work = work.slice(dm[0].length).trim(); }   // a transaction opens
    const am = work.match(TAB_AMOUNTS);
    if (am && date) {                                                              // amounts line → close the txn
      const before = work.slice(0, am.index).trim();
      if (before && !TAB_SKIP.test(before)) desc.push(before);
      const debit = NUM(am[1]), credit = NUM(am[2]), balance = NUM(am[3]);
      if (debit > 0 || credit > 0) {
        out.push({ txn_date: toISODate(date), description: desc.join(' ').replace(/\s+/g, ' ').trim(), reference_id: null, debit, credit, balance });
      }
      date = null; desc = [];
    } else if (date && work && !TAB_SKIP.test(work)) {                            // wrapped narration line
      desc.push(work);
    }
  }
  return out;
}

const looksLikeIdbi = (text) => /IPAY\/|INET\/|\bDr\.|\bCr\./i.test(text || '');

const DATE_AT_START = /^(\d{1,2}\/\d{1,2}\/\d{2,4})/;
// The "tail" carries: Dr./Cr.  INR  amount  timestamp  serial  balance — and in
// the real IDBI export it sits on ONE line (sometimes with the date+narration
// inline before it). This single regex anchors each transaction.
const TAIL_RE = /\b(Dr|Cr)\.?\s+([A-Z]{3})\s+([\d,]+\.\d{2})\s+(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}:\d{2})\s+(\d+)\s+([\d,]+\.\d{2})/i;

/**
 * Parse the REAL IDBI statement (OpTransactionHistory) format. Each transaction
 * ends with a "tail" line containing Dr./Cr. + amount + timestamp + serial +
 * balance. The date and (possibly wrapped) narration precede it — either on
 * their own lines or inline on the tail line itself. Repeated page headers and
 * footers are discarded by anchoring on the date that starts each transaction.
 */
export function parseIdbiBlocks(text) {
  const all = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+$/,'').trim());
  const out = [];
  let buffer = [];

  for (const line of all) {
    if (!line) continue;
    const m = line.match(TAIL_RE);
    if (!m) { buffer.push(line); continue; }

    const pre = line.slice(0, m.index).trim();       // date/narration on the tail line itself
    const combined = [...buffer, pre].filter(Boolean);
    buffer = [];

    // Anchor: start the transaction at the LAST line that begins with a date,
    // dropping any page-header/footer noise that accumulated before it.
    let startIdx = -1;
    for (let i = combined.length - 1; i >= 0; i--) {
      if (DATE_AT_START.test(combined[i])) { startIdx = i; break; }
    }
    const segs = startIdx >= 0 ? combined.slice(startIdx) : combined;
    if (!segs.length) continue;

    // Extract the transaction date from the first segment, then strip it.
    const dm = segs[0].match(DATE_AT_START);
    const txn_date = dm ? dm[1] : null;
    if (dm) segs[0] = segs[0].slice(dm[0].length).trim();
    const narrationLines = segs.filter(Boolean);
    const narration = rebuildNarration(narrationLines);

    const isDebit = /^Dr/i.test(m[1]);
    const amount = Number(m[3].replace(/,/g, ''));
    out.push({
      txn_date,
      description: narration,
      reference_id: null,            // filled by enrich() via parseNarration
      debit: isDebit ? amount : 0,
      credit: isDebit ? 0 : amount,
      balance: Number(m[6].replace(/,/g, '')),
      txn_time: m[4],
      serial_no: Number(m[5]),
      currency: m[2],
    });
  }
  // Fallback: if the tail format wasn't found at all, use the generic line parser.
  return out.length ? out : parseTextLines(text);
}

// Rebuild a narration string from possibly-wrapped OCR lines.
function rebuildNarration(lines) {
  if (!lines.length) return '';
  const first = lines[0];
  if (first.includes('/')) {
    const parts = first.split('/');
    const nameStart = parts.pop();
    const name = reconstructName([nameStart, ...lines.slice(1)]);
    return parts.join('/') + '/' + name;
  }
  // Space-format (e.g. credit: bank-ref then name)
  const ref = first;
  const name = reconstructName(lines.slice(1));
  return name ? `${ref} ${name}` : ref;
}

// Reads .xls (BIFF) and .xlsx (OOXML) via SheetJS into normalized lines.
function parseExcel(filePath) {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  // Array-of-arrays; raw:false formats dates/numbers to display strings.
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (!grid.length) return [];

  // Detect the header row (first of the top rows that mentions a date column).
  let headerIdx = 0;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    if ((grid[i] || []).some((v) => String(v).toLowerCase().includes('date'))) { headerIdx = i; break; }
  }
  const headers = (grid[headerIdx] || []).map((v) => String(v ?? '').toLowerCase().trim());

  const col = (names) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const cDate = col(['transaction date', 'txn date', 'date', 'value date']);
  const cDesc = col(['narration', 'description', 'particulars', 'remarks']);
  const cRef = col(['ref', 'utr', 'cheque', 'chq']);
  const cDebit = col(['debit', 'withdrawal']);
  const cCredit = col(['credit', 'deposit']);
  const cAmount = headers.findIndex((h) => h === 'amount' || h.includes('amount'));
  const cDrCr = col(['dr./cr', 'dr/cr', 'dr.cr', 'type', 'cr/dr', 'transaction type']);
  const cTime = col(['timestamp', 'time']);
  const cBal = col(['balance']);

  const lines = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    const get = (idx) => (idx >= 0 ? row[idx] : null);
    const { debit, credit } = splitAmount({
      debit: get(cDebit), credit: get(cCredit), amount: get(cAmount), drcr: get(cDrCr),
    });
    const date = toISODate(get(cDate));
    if (!date && !debit && !credit) continue;
    lines.push({
      txn_date: date,
      description: get(cDesc) ? String(get(cDesc)) : '',
      reference_id: get(cRef) ? String(get(cRef)).trim() : null,
      debit,
      credit,
      txn_time: cTime >= 0 && get(cTime) != null && get(cTime) !== '' ? String(get(cTime)) : null,
      balance: cBal >= 0 ? NUM(get(cBal)) : null,
    });
  }
  return lines;
}

// Resolve debit/credit from either separate columns or a single Amount column
// paired with a Dr./Cr. indicator (the IDBI layout).
function splitAmount({ debit, credit, amount, drcr }) {
  const d = NUM(debit);
  const c = NUM(credit);
  if (d || c) return { debit: d, credit: c };
  const amt = NUM(amount);
  if (!amt) return { debit: 0, credit: 0 };
  const flag = String(drcr || '').trim().toUpperCase();
  const isDebit = /^D|DR|DEBIT|WITHDRAW/.test(flag);
  const isCredit = /^C|CR|CREDIT|DEPOSIT/.test(flag);
  if (isCredit && !isDebit) return { debit: 0, credit: amt };
  // Default unknown indicators to debit (outgoing) — safer for an EPC payer.
  return { debit: amt, credit: 0 };
}

function parseCsv(text) {
  const rows = text.split(/\r?\n/).filter((r) => r.trim());
  if (!rows.length) return [];
  const split = (r) => r.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
  const headers = split(rows[0]).map((h) => h.toLowerCase());
  const idx = (names) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const cDate = idx(['transaction date', 'txn date', 'date', 'value date']);
  const cDesc = idx(['narration', 'description', 'particulars', 'remarks']);
  const cRef = idx(['ref', 'utr', 'cheque']);
  const cDebit = idx(['debit', 'withdrawal']);
  const cCredit = idx(['credit', 'deposit']);
  const cAmount = headers.findIndex((h) => h.includes('amount'));
  const cDrCr = idx(['dr./cr', 'dr/cr', 'dr.cr', 'type', 'cr/dr', 'transaction type']);
  const cTime = idx(['timestamp', 'time']);
  const cBal = idx(['balance']);
  const lines = [];
  for (let i = 1; i < rows.length; i++) {
    const c = split(rows[i]);
    const { debit, credit } = splitAmount({
      debit: c[cDebit], credit: c[cCredit], amount: cAmount >= 0 ? c[cAmount] : null, drcr: cDrCr >= 0 ? c[cDrCr] : null,
    });
    const date = toISODate(c[cDate]);
    if (!date && !debit && !credit) continue;
    lines.push({
      txn_date: date,
      description: cDesc >= 0 ? c[cDesc] : '',
      reference_id: cRef >= 0 ? c[cRef] : null,
      debit,
      credit,
      txn_time: cTime >= 0 ? c[cTime] : null,
      balance: cBal >= 0 ? NUM(c[cBal]) : null,
    });
  }
  return lines;
}

// Very rough text-statement parser: finds lines that contain a date and a number.
function parseTextLines(text) {
  const out = [];
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const date = toISODate(line);
    const nums = line.match(/[0-9][0-9,]*\.\d{2}/g);
    if (!date || !nums) continue;
    // Heuristic: last number is balance, previous is amount
    const amount = NUM(nums[nums.length - 2] ?? nums[0]);
    const balance = NUM(nums[nums.length - 1]);
    const isDebit = /\bdr\b|withdraw|debit/i.test(line);
    out.push({
      txn_date: date,
      description: line.replace(/[0-9][0-9,]*\.\d{2}/g, '').trim().slice(0, 120),
      reference_id: (line.match(/\b[A-Z]{2,6}\d{6,}\b/) || [])[0] || null,
      debit: isDebit ? amount : 0,
      credit: isDebit ? 0 : amount,
      balance,
    });
  }
  return out;
}

/**
 * Match a parsed line against existing records.
 * @param db pg client/pool
 * @returns { status, matchedType, matchedId }
 */
export async function matchLine(db, line) {
  const isDebit = line.debit > 0;
  const table = isDebit ? 'payments' : 'receipts';
  const amountCol = isDebit ? 'amount' : 'credited_amount';
  const amount = isDebit ? line.debit : line.credit;

  // 1) Exact reference match
  if (line.reference_id) {
    const { rows } = await db.query(
      `SELECT id FROM ${table} WHERE reference_id ILIKE $1 LIMIT 1`,
      [line.reference_id]
    );
    if (rows[0]) {
      return { status: 'matched', matchedType: isDebit ? 'payment' : 'receipt', matchedId: rows[0].id };
    }
  }

  // 2) Amount + date (±3 days) match
  const dateCol = isDebit ? 'payment_date' : 'credited_date';
  const { rows } = await db.query(
    `SELECT id FROM ${table}
      WHERE ${amountCol} = $1
        AND ($2::date IS NULL OR ${dateCol} BETWEEN $2::date - INTERVAL '3 days' AND $2::date + INTERVAL '3 days')
      LIMIT 2`,
    [amount, line.txn_date]
  );
  if (rows.length === 1) {
    return { status: 'matched', matchedType: isDebit ? 'payment' : 'receipt', matchedId: rows[0].id };
  }
  if (rows.length > 1) {
    return { status: 'duplicate', matchedType: isDebit ? 'payment' : 'receipt', matchedId: rows[0].id };
  }

  return { status: 'unmatched', matchedType: null, matchedId: null };
}
