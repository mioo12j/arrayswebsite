// ============================================================================
//  One-time real-data load for ARRAYS INGENIERIA.
//   1. Sets the 3 real GST branches (Greater Noida main / Bihar / Delhi).
//   2. Imports the full vendor (bank-beneficiary) list from the bank export.
//  Account numbers are read as TEXT so leading zeros / long numbers are exact.
//  Run:  node src/db/import-company.js  ["<path-to-xls>"]
// ============================================================================
import xlsx from 'xlsx';
import { pool } from '../config/db.js';

const XLS = process.argv[2] || 'C:/Users/siddh/Downloads/CounterPartyListUX513-06-2026.xls';

const BRANCHES = [
  { match: 'HO', code: 'UP', name: 'Greater Noida (Main Office)', gstin: '09AARCA4610L1ZC', state_code: '09',
    addr1: 'A-027, NSG SAS LIMITED, KNOWLEDGE PARK-1, POCKET P-6', place: 'Greater Noida', pincode: '201310', is_default: true },
  { match: 'BR02', code: 'BR', name: 'Bihar (Madhubani)', gstin: '10AARCA4610L1ZT', state_code: '10',
    addr1: 'Vill-Harpur, Panch-Haripur North, BLOCK-KALUAHI', place: 'Madhubani', pincode: '847229', is_default: false },
  { match: 'BR03', code: 'DL', name: 'Delhi (Palam)', gstin: '07AARCA4610L1ZG', state_code: '07',
    addr1: '3rd Floor, RZL-68, Back Side, Mahavir Enclave, Palam', place: 'New Delhi', pincode: '110045', is_default: false },
];

async function setupBranches() {
  const existing = (await pool.query('SELECT id, code FROM gst_branches ORDER BY created_at')).rows;
  for (let i = 0; i < BRANCHES.length; i++) {
    const b = BRANCHES[i];
    const target = existing.find((e) => e.code === b.match) || existing[i];
    const common = ['ARRAYS INGENIERIA PRIVATE LIMITED', 'ARRAYS INGENIERIA PRIVATE LIMITED', 'arraysingenieria@gmail.com'];
    if (target) {
      await pool.query(
        `UPDATE gst_branches SET code=$2,name=$3,gstin=$4,legal_name=$5,trade_name=$6,addr1=$7,place=$8,pincode=$9,state_code=$10,email=$11,is_default=$12,is_active=TRUE WHERE id=$1`,
        [target.id, b.code, b.name, b.gstin, common[0], common[1], b.addr1, b.place, b.pincode, b.state_code, common[2], b.is_default]);
    } else {
      await pool.query(
        `INSERT INTO gst_branches (code,name,gstin,legal_name,trade_name,addr1,place,pincode,state_code,email,is_default,is_active)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,TRUE)`,
        [b.code, b.name, b.gstin, common[0], b.addr1, b.place, b.pincode, b.state_code, common[2], b.is_default]);
    }
  }
  // ensure exactly one default
  await pool.query("UPDATE gst_branches SET is_default = (code='UP')");
  const rows = (await pool.query('SELECT code,gstin,state_code,is_default FROM gst_branches ORDER BY is_default DESC, code')).rows;
  console.log('Branches set:', rows.map((r) => `${r.code}=${r.gstin}${r.is_default ? '*' : ''}`).join(', '));
}

function readVendors() {
  const wb = xlsx.readFile(XLS, { cellText: true, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  // find the header row (the one containing 'Beneficiary ID')
  const hdr = rows.findIndex((r) => r.some((c) => String(c).trim() === 'Beneficiary ID'));
  const out = [];
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i];
    const benId = String(r[1] || '').trim();
    const name = String(r[2] || '').trim();
    const acct = String(r[3] || '').trim().replace(/\s+/g, '');
    const ifsc = String(r[4] || '').trim().toUpperCase();
    const status = String(r[5] || '').trim();
    if (!name && !acct) continue;
    out.push({ benId, name: name || `(Account ${acct})`, acct, ifsc, status });
  }
  return out;
}

async function importVendors() {
  const list = readVendors();
  console.log(`Parsed ${list.length} beneficiary rows.`);
  // group by normalised name → one vendor, multiple accounts
  const byName = new Map();
  for (const v of list) {
    const key = v.name.toUpperCase().replace(/\s+/g, ' ');
    if (!byName.has(key)) byName.set(key, { name: v.name, rows: [] });
    byName.get(key).rows.push(v);
  }
  let vendors = 0, accounts = 0, skippedAcct = 0;
  for (const { name, rows } of byName.values()) {
    const first = rows[0];
    const inactive = rows.every((r) => r.status && r.status.toLowerCase() !== 'active');
    const note = `Imported from bank beneficiary list. Beneficiary ID${rows.length > 1 ? 's' : ''}: ${rows.map((r) => r.benId).filter(Boolean).join(', ')}${inactive ? ' — INACTIVE' : ''}`;
    const ins = await pool.query(
      `INSERT INTO vendors (name, bank_account, ifsc, notes) VALUES ($1,$2,$3,$4) RETURNING id`,
      [name, first.acct || null, first.ifsc || null, note]);
    const vid = ins.rows[0].id;
    vendors++;
    for (const r of rows) {
      if (!r.acct) continue;
      const res = await pool.query(
        `INSERT INTO vendor_accounts (vendor_id, account_number, ifsc, label) VALUES ($1,$2,$3,$4)
         ON CONFLICT (account_number) DO NOTHING`,
        [vid, r.acct, r.ifsc || null, r.name]);
      if (res.rowCount) accounts++; else skippedAcct++;
    }
  }
  console.log(`Imported ${vendors} vendors, ${accounts} bank accounts (${skippedAcct} duplicate accounts skipped).`);
}

async function run() {
  await setupBranches();
  await importVendors();
  const vc = (await pool.query('SELECT count(*) c FROM vendors')).rows[0].c;
  const ac = (await pool.query('SELECT count(*) c FROM vendor_accounts')).rows[0].c;
  console.log(`DONE. vendors=${vc}, vendor_accounts=${ac}`);
  await pool.end();
}
run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
