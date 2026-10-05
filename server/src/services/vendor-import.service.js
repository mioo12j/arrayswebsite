// ============================================================================
//  Vendor Master import — parse an uploaded Excel/CSV vendor list into
//  normalized vendor records. Tolerant of varied column headings.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx'; // reads .xls and .xlsx

const norm = (s) => String(s ?? '').trim();

// Map a header cell to a known field.
function classify(header) {
  const h = header.toLowerCase().replace(/[^a-z]/g, '');
  // Core identity fields (the only ones strictly needed for auto-matching)
  if (/(beneficiaryid|benefid|benid|vendorid|payeeid)/.test(h)) return 'beneficiary_id';
  if (/(nickname|shortname|alias|displayname)/.test(h)) return 'name';
  if (/(accountnumber|accountno|acno|accno|acc|bankaccount|benefacc|payeeacc)/.test(h)) return 'account_number';
  if (/(vendorname|partyname|payeename|name|beneficiary)/.test(h) && !/account|id/.test(h)) return 'name';
  if (/ifsc/.test(h)) return 'ifsc';
  if (/(gstin|gst)/.test(h)) return 'gstin';
  if (/category/.test(h)) return 'category';
  if (/(material|materialtype)/.test(h)) return 'material_type';
  if (/(phone|mobile|contactno)/.test(h)) return 'phone';
  if (/email/.test(h)) return 'email';
  if (/(tag|tags)/.test(h)) return 'tags';
  if (/(contactperson|contactname|contact)/.test(h)) return 'contact_name';
  if (/address/.test(h)) return 'address';
  return null;
}

function rowToVendor(map, getter) {
  const v = {};
  for (const [field, idx] of Object.entries(map)) {
    const val = norm(getter(idx));
    if (!val) continue;
    if (field === 'tags') v.tags = val.split(/[;,|]/).map((t) => t.trim()).filter(Boolean);
    else v[field] = val;
  }
  return v.name ? v : null;
}

export async function parseVendorFile(filePath, mimeType = '') {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv' || mimeType === 'text/csv') return parseCsv(fs.readFileSync(filePath, 'utf8'));
  return parseExcel(filePath);
}

function parseExcel(filePath) {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return rowsToVendors(grid);
}

// Shared logic for grid (array-of-arrays) -> vendor records, with header-row
// auto-detection (vendor lists often have title rows above the real header).
function rowsToVendors(grid) {
  if (!grid.length) return [];
  // Classify every candidate row; title rows ("Beneficiary Details/List") can
  // falsely classify as a name column, so prefer the row that ALSO has an
  // account column, then fall back to the richest header found.
  const candidates = [];
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const cells = (grid[i] || []).map(norm);
    const m = {};
    cells.forEach((h, idx) => { const f = classify(h); if (f && !(f in m)) m[f] = idx; });
    candidates.push({ i, m, score: Object.keys(m).length });
  }
  let best =
    candidates.find((c) => c.m.account_number != null && (c.m.name != null || c.m.beneficiary_id != null)) ||
    candidates.filter((c) => c.m.account_number != null).sort((a, b) => b.score - a.score)[0] ||
    candidates.filter((c) => c.m.name != null).sort((a, b) => b.score - a.score)[0];
  if (!best) return [];
  const headerIdx = best.i;
  const map = best.m;
  const out = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    const vendor = rowToVendor(map, (idx) => row[idx]);
    if (vendor) out.push(vendor);
  }
  return out;
}

function parseCsv(text) {
  const rows = text.split(/\r?\n/).filter((r) => r.trim());
  if (!rows.length) return [];
  const split = (r) => r.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
  return rowsToVendors(rows.map(split));
}
