// ============================================================================
//  #10 Customer GSTIN validation — keeps bad data out of the compliance flow.
//  Local checks always run (format, checksum, state, pincode). In live mode the
//  adapter can later add registration status. Results are stored & auditable.
// ============================================================================

import { isValidGstin, gstinState } from './validation.js';
import { STATE_CODES, PIN_PREFIX_STATE } from './masterData.js';
import { getMode } from './adapter.js';
import { recordAudit } from './log.js';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

export async function validate(db, { gstin, name, pincode, stateCode, clientId, override } = {}, userId) {
  const g = String(gstin || '').trim().toUpperCase();
  const formatOk = GSTIN_RE.test(g);
  const checksumOk = isValidGstin(g);
  const st = g.slice(0, 2);
  const stateName = STATE_CODES[st] || null;
  const stateMatch = stateCode ? String(stateCode).padStart(2, '0') === st : null;
  let pincodeMatch = null;
  if (pincode && /^[1-9][0-9]{5}$/.test(String(pincode))) {
    const exp = PIN_PREFIX_STATE[Number(String(pincode).slice(0, 2))];
    pincodeMatch = exp ? exp === st : null;
  }
  // Live mode could fetch registration status here via the adapter (stubbed).
  const status = getMode() === 'live' ? 'Unknown' : (checksumOk ? 'Assumed Active' : 'Unknown');
  const result = !formatOk || !checksumOk ? 'invalid' : (stateMatch === false || pincodeMatch === false ? 'warning' : 'valid');

  const issues = [];
  if (!formatOk) issues.push('GSTIN format is invalid (expected 15 characters: 2 state + 10 PAN + 3).');
  else if (!checksumOk) issues.push('GSTIN check-digit failed — likely a typo.');
  if (stateMatch === false) issues.push(`GSTIN state (${stateName || st}) does not match the entered state code ${stateCode}.`);
  if (pincodeMatch === false) issues.push('Pincode does not look consistent with the GSTIN state.');

  const { rows } = await db.query(
    `INSERT INTO gst_gstin_validations (gstin, client_id, format_ok, checksum_ok, state_code, state_name, pincode_match, legal_name, status, source, result, note, override_reason, validated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [g, clientId || null, formatOk, checksumOk, st, stateName, pincodeMatch, name || null, status, getMode() === 'live' ? 'portal' : 'local', result, issues.join(' ') || null, override || null, userId]
  );
  await recordAudit(db, { objectType: 'client', objectId: clientId || rows[0].id, eventType: 'gstin_validated', field: 'gstin', newValue: g, message: `GSTIN ${g} validated → ${result}`, userId });
  return { gstin: g, formatOk, checksumOk, stateCode: st, stateName, stateMatch, pincodeMatch, status, result, issues };
}

export async function history(db, gstin) {
  const { rows } = await db.query(
    `SELECT v.*, u.name AS validated_by_name FROM gst_gstin_validations v LEFT JOIN users u ON u.id=v.validated_by
     WHERE gstin=$1 ORDER BY validated_at DESC LIMIT 20`, [String(gstin || '').toUpperCase()]);
  return rows;
}
