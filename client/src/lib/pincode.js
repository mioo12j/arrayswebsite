// ============================================================================
//  Offline PIN-code → State / GST-state-code lookup.
//
//  India's PIN codes encode the postal region in their first 2–3 digits, which
//  maps reliably to a State. We can't derive the exact town/locality offline
//  (that needs the full PIN directory), so callers should treat `state` as a
//  starting point for the Location field and let the user refine it. The GST
//  state code, however, is dependable and is what the e-Invoice schema needs.
//
//  Ranges are keyed by the first 3 digits and are non-overlapping; edge circles
//  shared between two states (Delhi/Haryana, Bihar/Jharkhand, UP/Uttarakhand,
//  the North-East, UT enclaves) use finer 3-digit splits.
// ============================================================================

// [from3, to3, gstStateCode, stateName]
const RANGES = [
  [110, 119, '07', 'Delhi'],
  [120, 136, '06', 'Haryana'],
  [140, 159, '03', 'Punjab'],
  [160, 160, '04', 'Chandigarh'],
  [161, 169, '03', 'Punjab'],
  [170, 177, '02', 'Himachal Pradesh'],
  [180, 193, '01', 'Jammu & Kashmir'],
  [194, 194, '38', 'Ladakh'],
  [201, 245, '09', 'Uttar Pradesh'],
  [246, 246, '05', 'Uttarakhand'],
  [247, 247, '09', 'Uttar Pradesh'],   // Saharanpur
  [248, 249, '05', 'Uttarakhand'],     // Dehradun, Haridwar
  [250, 262, '09', 'Uttar Pradesh'],
  [263, 263, '05', 'Uttarakhand'],     // Nainital / Almora
  [264, 285, '09', 'Uttar Pradesh'],
  [301, 345, '08', 'Rajasthan'],
  [360, 395, '24', 'Gujarat'],
  [396, 396, '26', 'Dadra & Nagar Haveli and Daman & Diu'],
  [400, 402, '27', 'Maharashtra'],
  [403, 403, '30', 'Goa'],
  [404, 445, '27', 'Maharashtra'],
  [450, 488, '23', 'Madhya Pradesh'],
  [490, 497, '22', 'Chhattisgarh'],
  [500, 509, '36', 'Telangana'],
  [515, 535, '37', 'Andhra Pradesh'],
  [560, 591, '29', 'Karnataka'],
  [600, 604, '33', 'Tamil Nadu'],
  [605, 605, '34', 'Puducherry'],
  [606, 643, '33', 'Tamil Nadu'],
  [670, 695, '32', 'Kerala'],
  [700, 736, '19', 'West Bengal'],
  [737, 737, '11', 'Sikkim'],
  [738, 743, '19', 'West Bengal'],
  [744, 744, '35', 'Andaman & Nicobar Islands'],
  [750, 770, '21', 'Odisha'],
  [781, 788, '18', 'Assam'],
  [790, 792, '12', 'Arunachal Pradesh'],
  [793, 794, '17', 'Meghalaya'],
  [795, 795, '14', 'Manipur'],
  [796, 796, '15', 'Mizoram'],
  [797, 798, '13', 'Nagaland'],
  [799, 799, '16', 'Tripura'],
  [800, 813, '10', 'Bihar'],
  [814, 820, '20', 'Jharkhand'],       // Deoghar, Giridih, Dumka
  [821, 824, '10', 'Bihar'],           // Sasaram, Gaya, Aurangabad
  [825, 835, '20', 'Jharkhand'],       // Hazaribagh, Dhanbad, Ranchi, Jamshedpur
  [841, 855, '10', 'Bihar'],           // Chapra … Madhubani (847) … Kishanganj
];

// Returns { stateCode, state } for a 6-digit PIN, or null if unknown.
export function pincodeToState(pin) {
  const p = String(pin || '').replace(/\D/g, '');
  if (p.length !== 6) return null;
  const d3 = Number(p.slice(0, 3));
  for (const [from, to, code, name] of RANGES) {
    if (d3 >= from && d3 <= to) return { stateCode: code, state: name };
  }
  return null;
}
