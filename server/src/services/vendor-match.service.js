// ============================================================================
//  Vendor auto-mapping — the intelligence that links a raw bank transaction to
//  a known vendor. Strategy (highest confidence first):
//   1. Exact beneficiary ACCOUNT NUMBER match (vendor_accounts or vendors.bank_account)
//   2. Fuzzy BENEFICIARY NAME match (pg_trgm similarity)
//  Returns { vendor_id, vendor_name, confidence (0-100), method } or null.
// ============================================================================

const NAME_THRESHOLD = 0.34; // floor for SUGGESTING a name match (shown with confidence)
const ATTACH_THRESHOLD = 0.55; // higher bar before we SILENTLY link a bank line to an existing vendor
                               // by name — below this we create a reviewable candidate instead, so a
                               // wrong auto-link never corrupts a real vendor's ledger (merge tool cleans up).

// Strip bank-statement noise so "MR SANJEEV KUMAR SINGH S/O RAM" cleanly matches
// a vendor named "Sanjeev Kumar Singh". pg_trgm already ignores case.
export function normalizeName(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\b[SDW]\/O\b.*$/, ' ')                     // drop "S/O ..."/"D/O ..."/"W/O ..." tail
    .replace(/\b(MR|MRS|MS|MISS|DR|SHRI|SHRImati|SMT|SH|KM|KUMARI)\b/g, ' ')  // honorifics
    .replace(/\b(NEFT|RTGS|IMPS|UPI|PMT|PAYMENT|TXN|REF|TRANSFER|TO|A\/C|AC)\b/g, ' ') // bank tokens
    .replace(/[^A-Z0-9 ]/g, ' ')                          // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

export async function findVendorByAccount(db, accountNumber) {
  if (!accountNumber) return null;
  const acc = String(accountNumber).trim();
  if (acc.length < 5) return null;
  // vendor_accounts (multiple accounts per vendor) takes priority, then the
  // primary bank_account on the vendor record itself.
  const { rows } = await db.query(
    `SELECT v.id, v.name FROM vendor_accounts va
       JOIN vendors v ON v.id = va.vendor_id
      WHERE va.account_number = $1
     UNION
     SELECT v.id, v.name FROM vendors v WHERE v.bank_account = $1
     LIMIT 1`,
    [acc]
  );
  return rows[0] || null;
}

export async function findVendorByName(db, name) {
  if (!name) return null;
  const clean = normalizeName(name);
  if (clean.length < 3) return null;
  // GREATEST of plain similarity and both-direction word_similarity so a subset
  // name ("Sanjeev Kumar") still matches a fuller one ("Sanjeev Kumar Singh").
  const { rows } = await db.query(
    `SELECT id, name,
            GREATEST(similarity(name,$1), word_similarity($1,name), word_similarity(name,$1)) AS score
       FROM vendors
      WHERE GREATEST(similarity(name,$1), word_similarity($1,name), word_similarity(name,$1)) > $2
      ORDER BY score DESC
      LIMIT 1`,
    [clean, NAME_THRESHOLD]
  );
  return rows[0] || null;
}

/**
 * Auto-map a transaction to a vendor.
 * @param db pg client/pool
 * @param {{ accountNumber?: string, beneficiary?: string }} hint
 */
export async function autoMapVendor(db, { accountNumber, beneficiary } = {}) {
  const byAcc = await findVendorByAccount(db, accountNumber);
  if (byAcc) {
    return { vendor_id: byAcc.id, vendor_name: byAcc.name, confidence: 100, method: 'account' };
  }
  const byName = await findVendorByName(db, beneficiary);
  if (byName) {
    return {
      vendor_id: byName.id,
      vendor_name: byName.name,
      confidence: Math.round(Number(byName.score) * 100),
      method: 'name',
    };
  }
  return null;
}

/**
 * Find an existing vendor or auto-create a lightweight candidate so that
 * reconciliation never stalls on incomplete master data. The operator enriches
 * GST/IFSC/category/etc. later.
 * @returns { vendor_id, vendor_name, confidence, method, created }
 */
export async function findOrCreateVendor(db, { accountNumber, beneficiary, reference, date, userId } = {}) {
  const matched = await autoMapVendor(db, { accountNumber, beneficiary });
  // An account-number match is always trusted. A NAME match is only trusted for
  // silent linking above ATTACH_THRESHOLD; a weaker name match creates a new
  // candidate instead of risking a wrong link onto a real vendor's ledger.
  if (matched && (matched.method === 'account' || matched.confidence >= ATTACH_THRESHOLD * 100)) {
    return { ...matched, created: false };
  }
  if (!beneficiary && !accountNumber) return null;

  const name = (beneficiary && String(beneficiary).trim()) || `Vendor ${accountNumber}`;
  const { rows } = await db.query(
    `INSERT INTO vendors (name, beneficiary_id, bank_account, is_candidate, first_seen_date)
     VALUES ($1,$2,$3,true,COALESCE($4::date, CURRENT_DATE)) RETURNING id, name`,
    [name, reference || null, accountNumber || null, date || null]
  );
  if (accountNumber) {
    await db.query(
      `INSERT INTO vendor_accounts (vendor_id, account_number, label)
       VALUES ($1,$2,'auto') ON CONFLICT (account_number) DO NOTHING`,
      [rows[0].id, String(accountNumber).trim()]
    );
  }
  return { vendor_id: rows[0].id, vendor_name: rows[0].name, confidence: 100, method: 'auto-created', created: true };
}

/** Find an existing client or auto-create a candidate (for incoming credits). */
export async function findOrCreateClient(db, { name, reference, date } = {}) {
  const matched = await autoMapClient(db, { name });
  if (matched) return { ...matched, created: false };
  if (!name || String(name).trim().length < 2) return null;
  const { rows } = await db.query(
    `INSERT INTO clients (name, is_candidate) VALUES ($1,true) RETURNING id, name`,
    [String(name).trim()]
  );
  return { client_id: rows[0].id, client_name: rows[0].name, confidence: 100, method: 'auto-created', created: true };
}

/** Same idea for clients (incoming credits). */
export async function autoMapClient(db, { name } = {}) {
  if (!name || String(name).trim().length < 3) return null;
  const { rows } = await db.query(
    `SELECT id, name, similarity(name, $1) AS score
       FROM clients
      WHERE similarity(name, $1) > $2
      ORDER BY score DESC LIMIT 1`,
    [String(name).trim(), NAME_THRESHOLD]
  );
  if (!rows[0]) return null;
  return { client_id: rows[0].id, client_name: rows[0].name, confidence: Math.round(Number(rows[0].score) * 100), method: 'name' };
}
