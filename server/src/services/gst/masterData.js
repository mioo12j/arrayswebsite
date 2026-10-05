// ============================================================================
//  GST master / reference data layer
//
//  All portal-controlled enums live here and are seeded into gst_master_data.
//  Validation reads from the in-memory cache (refreshed from the DB), so when
//  the portal publishes new codes you only update/seed the table — no code in
//  the rest of the app hard-codes these values.
// ============================================================================

// ── GST state codes (first two digits of a GSTIN) ──────────────────────────
export const STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra', '28': 'Andhra Pradesh (Old)', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

// Approximate PIN-prefix → state-code map (first 2 digits of pincode → GST state
// code). Mirrors the portal's pincode↔state sanity check. Soft check.
export const PIN_PREFIX_STATE = {
  11: '07', 12: '06', 13: '03', 14: '03', 15: '03', 16: '03', 17: '02', 18: '01',
  19: '01', 20: '09', 21: '09', 22: '09', 23: '09', 24: '09', 25: '09', 26: '09',
  27: '09', 28: '09', 30: '08', 31: '08', 32: '08', 33: '08', 34: '08', 36: '24',
  37: '24', 38: '24', 39: '24', 40: '27', 41: '27', 42: '27', 43: '27', 44: '27',
  45: '23', 46: '23', 47: '23', 48: '23', 49: '22', 50: '36', 51: '37', 52: '37',
  53: '37', 56: '29', 57: '29', 58: '29', 59: '29', 60: '33', 61: '33', 62: '33',
  63: '33', 64: '33', 67: '32', 68: '32', 69: '32', 70: '19', 71: '19', 72: '19',
  73: '19', 74: '19', 75: '21', 76: '21', 77: '21', 78: '18', 79: '18', 80: '10',
  81: '10', 82: '10', 83: '10', 84: '10', 85: '20', 90: '99', 91: '99', 92: '99',
};

// ── e-Invoice transaction-level: SupTyp ────────────────────────────────────
export const EINV_SUPPLY_TYPES = [
  ['B2B', 'Business to Business'],
  ['B2C', 'Business to Consumer'],
  ['SEZWP', 'SEZ with payment'],
  ['SEZWOP', 'SEZ without payment'],
  ['EXPWP', 'Export with payment'],
  ['EXPWOP', 'Export without payment'],
  ['DEXP', 'Deemed Export'],
];

// e-Invoice DocDtls.Typ
export const EINV_DOC_TYPES = [
  ['INV', 'Tax Invoice'], ['CRN', 'Credit Note'], ['DBN', 'Debit Note'],
];

// ── e-Way Bill supply / sub-supply / doc ───────────────────────────────────
export const EWB_SUPPLY_TYPES = [['O', 'Outward'], ['I', 'Inward']];

export const EWB_SUB_SUPPLY_TYPES = [
  ['1', 'Supply'], ['2', 'Import'], ['3', 'Export'], ['4', 'Job Work'],
  ['5', 'For Own Use'], ['6', 'Job Work Returns'], ['7', 'Sales Return'],
  ['8', 'Others'], ['9', 'SKD/CKD/Lots'], ['10', 'Line Sales'],
  ['11', 'Recipient Not Known'], ['12', 'Exhibition or Fairs'],
];

export const EWB_DOC_TYPES = [
  ['INV', 'Tax Invoice'], ['BIL', 'Bill of Supply'], ['BOE', 'Bill of Entry'],
  ['CHL', 'Delivery Challan'], ['CNT', 'Credit Note'], ['OTH', 'Others'],
];

// ── Transport ──────────────────────────────────────────────────────────────
export const TRANS_MODES = [
  ['1', 'Road'], ['2', 'Rail'], ['3', 'Air'], ['4', 'Ship'],
];
export const VEHICLE_TYPES = [['R', 'Regular'], ['O', 'Over Dimensional Cargo']];

export const EWB_TXN_TYPES = [
  ['1', 'Regular'], ['2', 'Bill To - Ship To'],
  ['3', 'Bill From - Dispatch From'], ['4', 'Combination of 2 and 3'],
];

// ── Cancellation reason codes (different per object) ────────────────────────
export const EWB_CANCEL_REASONS = [
  ['1', 'Duplicate'], ['2', 'Order Cancelled'],
  ['3', 'Data Entry Mistake'], ['4', 'Others'],
];
export const EINV_CANCEL_REASONS = [
  ['1', 'Duplicate'], ['2', 'Data Entry Mistake'],
  ['3', 'Order Cancelled'], ['4', 'Others'],
];

// ── UQC (unit of measure) — common subset ──────────────────────────────────
export const UQC = [
  ['BAG', 'Bags'], ['BOX', 'Box'], ['BTL', 'Bottles'], ['BDL', 'Bundles'],
  ['CTN', 'Cartons'], ['CBM', 'Cubic Meters'], ['CMS', 'Centimetres'],
  ['DOZ', 'Dozens'], ['DRM', 'Drums'], ['GMS', 'Grammes'], ['KGS', 'Kilograms'],
  ['KLR', 'Kilolitre'], ['KME', 'Kilometre'], ['LTR', 'Litres'], ['MTR', 'Metres'],
  ['MLT', 'Millilitre'], ['MTS', 'Metric Ton'], ['NOS', 'Numbers'], ['PAC', 'Packs'],
  ['PCS', 'Pieces'], ['PRS', 'Pairs'], ['QTL', 'Quintal'], ['ROL', 'Rolls'],
  ['SET', 'Sets'], ['SQF', 'Square Feet'], ['SQM', 'Square Metres'], ['TBS', 'Tablets'],
  ['TON', 'Tonnes'], ['UNT', 'Units'], ['YDS', 'Yards'], ['OTH', 'Others'],
];

// ── Allowed GST rates (%) ──────────────────────────────────────────────────
export const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

// ── A few example HSN codes (validation is mainly length/format) ───────────
export const HSN_SAMPLES = [
  ['8541', 'Photosensitive semiconductor devices / solar cells'],
  ['854143', 'Photovoltaic cells assembled in modules / panels'],
  ['850440', 'Static converters (solar inverters)'],
  ['8544', 'Insulated wire / cable'],
  ['7308', 'Structures and parts of iron or steel'],
  ['9954', 'Construction services'],
  ['998732', 'Installation of solar / EPC services'],
];

// All categories assembled for seeding.
function pairsToRows(category, pairs, metaFn) {
  return pairs.map(([code, name]) => ({ category, code, name, meta: metaFn ? metaFn(code, name) : {} }));
}

export function allMasterRows() {
  const rows = [];
  for (const [code, name] of Object.entries(STATE_CODES)) rows.push({ category: 'state_code', code, name, meta: {} });
  rows.push(...pairsToRows('einv_supply_type', EINV_SUPPLY_TYPES));
  rows.push(...pairsToRows('einv_doc_type', EINV_DOC_TYPES));
  rows.push(...pairsToRows('ewb_supply_type', EWB_SUPPLY_TYPES));
  rows.push(...pairsToRows('ewb_sub_supply_type', EWB_SUB_SUPPLY_TYPES));
  rows.push(...pairsToRows('ewb_doc_type', EWB_DOC_TYPES));
  rows.push(...pairsToRows('trans_mode', TRANS_MODES));
  rows.push(...pairsToRows('vehicle_type', VEHICLE_TYPES));
  rows.push(...pairsToRows('ewb_txn_type', EWB_TXN_TYPES));
  rows.push(...pairsToRows('ewb_cancel_reason', EWB_CANCEL_REASONS));
  rows.push(...pairsToRows('einv_cancel_reason', EINV_CANCEL_REASONS));
  rows.push(...pairsToRows('uqc', UQC));
  rows.push(...pairsToRows('hsn', HSN_SAMPLES));
  rows.push(...GST_RATES.map((r) => ({ category: 'gst_rate', code: String(r), name: `${r}%`, meta: {} })));
  return rows;
}

// ── Seeding (idempotent upsert) ────────────────────────────────────────────
export async function seedMasterData(db) {
  const rows = allMasterRows();
  for (const r of rows) {
    await db.query(
      `INSERT INTO gst_master_data (category, code, name, meta, active, synced_at)
       VALUES ($1,$2,$3,$4,TRUE,now())
       ON CONFLICT (category, code)
       DO UPDATE SET name = EXCLUDED.name, meta = EXCLUDED.meta, active = TRUE, synced_at = now()`,
      [r.category, r.code, r.name, JSON.stringify(r.meta || {})]
    );
  }
  return rows.length;
}

// ── Cached lookup (used by the validation engine) ──────────────────────────
let _cache = null; // { category: Map(code -> name) }
let _loadedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export async function loadMaster(db, force = false) {
  if (_cache && !force && Date.now() - _loadedAt < TTL_MS) return _cache;
  const { rows } = await db.query(
    `SELECT category, code, name FROM gst_master_data WHERE active = TRUE`
  );
  const map = {};
  for (const r of rows) {
    (map[r.category] ||= new Map()).set(String(r.code), r.name);
  }
  // Fallback to in-code definitions if the table is empty (not yet seeded).
  if (!rows.length) {
    for (const r of allMasterRows()) (map[r.category] ||= new Map()).set(String(r.code), r.name);
  }
  _cache = map;
  _loadedAt = Date.now();
  return _cache;
}

export function clearMasterCache() { _cache = null; _loadedAt = 0; }

// Synchronous helpers backed by the in-code definitions (always available even
// before the DB cache is warmed) — handy for pure validation utilities.
export function isStateCode(code) { return Object.prototype.hasOwnProperty.call(STATE_CODES, String(code).padStart(2, '0')); }
export function stateName(code) { return STATE_CODES[String(code).padStart(2, '0')] || null; }
