// ============================================================================
//  Bank narration intelligence — tuned for IDBI Bank statement formats.
//  Splits a raw description into structured fields:
//    { mode, reference_id, account_number, beneficiary }
//
//  Handles, among others:
//    IPAY/INST/NEFT/007722305751/32911016237/MONI KUMAR
//    IPAY/INST/RTGS/007722287371/94512010011121/NISHI P
//    HDFCR52026050152692982 SOLARGRIDXVENTURESPVTLTD
//    NEFT-SBIN0001234-REMEDIE ENTERPRISES-50200086148945
// ============================================================================

const MODE_RE = /^(NEFT|RTGS|IMPS|UPI|ACH|INFT|FT)$/i;

function inferModeFromRef(ref) {
  // IDBI/HDFC style refs encode channel in the letter after the bank code:
  //   N -> NEFT, R -> RTGS, P/M -> IMPS
  const m = String(ref).match(/^[A-Z]{2,6}([NRPM])/i);
  if (!m) return null;
  const c = m[1].toUpperCase();
  return c === 'R' ? 'RTGS' : c === 'N' ? 'NEFT' : 'IMPS';
}

export function parseNarration(description) {
  const result = { mode: null, reference_id: null, account_number: null, beneficiary: null };
  const text = String(description || '').trim();
  if (!text) return result;

  // ── Slash / dash delimited (IPAY/INST/NEFT/...) ───────────────────────────
  if (text.includes('/') || /-[A-Z]{4}\d/.test(text)) {
    const parts = text.split(/[/\-|]/).map((s) => s.trim()).filter(Boolean);
    const modeIdx = parts.findIndex((p) => MODE_RE.test(p));
    if (modeIdx >= 0) {
      result.mode = parts[modeIdx].toUpperCase();
      const rest = parts.slice(modeIdx + 1);
      // reference: first token after mode that looks like a ref (>=6 alnum)
      const refIdx = rest.findIndex((p) => /^[A-Za-z0-9]{6,}$/.test(p));
      if (refIdx >= 0) result.reference_id = rest[refIdx];
      // account number: a long numeric token (9–18 digits) after the reference
      const accIdx = rest.findIndex((p, i) => i > refIdx && /^\d{9,18}$/.test(p));
      if (accIdx >= 0) {
        result.account_number = rest[accIdx];
        result.beneficiary = rest.slice(accIdx + 1).join(' ').trim() || null;
      } else {
        // No clear account: everything after the reference is the beneficiary
        result.beneficiary = rest.slice(refIdx + 1).join(' ').trim() || null;
      }
      // Some IFSC-led formats put the name before the account:
      if (!result.beneficiary && rest.length) result.beneficiary = rest[rest.length - 1];
      return result;
    }
    // Slash format without a recognized mode keyword
    result.account_number = (parts.find((p) => /^\d{9,18}$/.test(p))) || null;
    result.reference_id = parts.find((p) => /[A-Z]{2,}\d{6,}|^\d{8,}$/i.test(p)) || null;
    result.beneficiary = parts[parts.length - 1] || null;
    return result;
  }

  // ── Space-delimited bank-reference format ─────────────────────────────────
  const tokens = text.split(/\s+/).filter(Boolean);
  const refTok =
    tokens.find((t) => /^[A-Z]{2,6}[A-Z0-9]?\d{8,}$/i.test(t)) ||
    tokens.find((t) => /\d{10,}/.test(t));
  if (refTok) {
    result.reference_id = refTok;
    result.mode = inferModeFromRef(refTok);
    const acc = tokens.find((t) => /^\d{9,18}$/.test(t) && t !== refTok);
    if (acc) result.account_number = acc;
    result.beneficiary =
      tokens.filter((t) => t !== refTok && t !== acc).join(' ').trim() || null;
  } else {
    result.beneficiary = text;
  }
  // Mode keyword anywhere in plain text
  if (!result.mode) {
    const m = text.match(/\b(NEFT|RTGS|IMPS|UPI)\b/i);
    if (m) result.mode = m[1].toUpperCase();
  }
  return result;
}

/**
 * Reconstruct a name from OCR fragments that were wrapped across lines.
 * Heuristic tuned to real IDBI statements:
 *   ['MONI','KUMAR']  -> 'MONI KUMAR'   (two full words)
 *   ['PRABH','AT']    -> 'PRABHAT'      (a broken single word)
 *   ['RANVEER','S']   -> 'RANVEER S'    (trailing initial)
 *   ['TCI','FRE']     -> 'TCI FRE'      (later fuzzy-matched to vendor master)
 */
export function reconstructName(fragments) {
  const parts = (fragments || []).map((f) => String(f || '').trim()).filter(Boolean);
  if (!parts.length) return '';
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const a = parts[i - 1];
    const b = parts[i];
    let space = ' ';
    if (b.length === 1) space = ' ';                         // initial
    else if (a.length >= 4 && b.length <= 3) space = '';     // broken word (PRABH+AT)
    out += space + b;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Map detected channel to the payment_mode enum used by the payments table.
export function modeToEnum(mode) {
  const map = { NEFT: 'neft', RTGS: 'rtgs', IMPS: 'imps', UPI: 'upi' };
  return map[String(mode || '').toUpperCase()] || 'other';
}
