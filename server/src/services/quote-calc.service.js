// ============================================================================
//  Solar project estimation engine.
//  Given a system size + project type + (optional) rate overrides, it computes
//  a full Bill of Quantities, cost, contingency, margin, GST and total.
//  All rates are explicit and overridable — no hidden/dummy numbers.
// ============================================================================

// Default rates (INR). Tuned per project type; every value is overridable
// through the `inputs` payload so estimates reflect real procurement prices.
// All work rates are ₹ PER WATT (₹/Wp). e.g. ₹4/W civil on a 25 kWp system
// = ₹4 × 25,000 W. Operator rates are the final client price (they already
// include the company's margin) — no hidden margin/contingency is added.
const DEFAULTS = {
  panel_wattage: 545,            // Wp per module
  panel_rate: 11990,             // ₹ per module (when panel basis = module)
  panel_rate_per_watt: 22,       // ₹/W  (when panel basis = watt)
  extra_module_pct: 0,           // % extra modules on client demand
  inverter_rate: 4.2,            // ₹/W
  structure_rate: 3.5,           // ₹/W
  bos_rate: 4,                   // ₹/W  — combined cabling + earthing + balance of system
  civil_rate: 0,                 // ₹/W  (set per project type below)
  labour_rate: 2.5,              // ₹/W  — installation, testing & commissioning
  transport_rate: 0.5,           // ₹/W  (only when transport is not included)
  contingency_pct: 0,            // optional — off by default
  margin_pct: 15,                // operator markup on cost; distributed across BOQ item rates
  gst_pct: 13.8,                 // blended GST on solar
  tariff_per_kwh: 8,             // grid tariff offset (₹/kWh) for savings calc
  generation_per_kw_year: 1500,  // kWh per kW per year (~17% CUF)
  subsidy_amount: 0,             // manual override for non-residential
};

// Project-type specific civil work intensity (₹ per watt).
const CIVIL_BY_TYPE = {
  residential: 0.5,
  rooftop: 0.6,
  commercial: 0.9,
  institutional: 0.9,
  government: 1.0,
  industrial: 1.5,
  ground_mount: 3.2,
  utility: 3.2,
};

// PM Surya Ghar residential subsidy (capped ₹78,000).
function residentialSubsidy(kw) {
  return Math.min(78000, 30000 * Math.min(kw, 2) + (kw > 2 ? 18000 : 0));
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function calculateQuote(input = {}) {
  const r = { ...DEFAULTS, ...clean(input) };
  const kw = Number(input.capacity_kw || 0);
  const wp = kw * 1000;
  const type = input.project_type || 'rooftop';
  if (!r.civil_rate) r.civil_rate = CIVIL_BY_TYPE[type] ?? CIVIL_BY_TYPE.rooftop;
  const panelBasis = String(input.panel_rate_basis || 'module') === 'watt' ? 'watt' : 'module';
  const transportIncluded = !(input.transport_included === false || String(input.transport_included).toLowerCase() === 'false' || String(input.transport_included).toLowerCase() === 'no');

  const extraPct = Number(r.extra_module_pct) || 0;
  const panelCount = wp > 0 ? Math.ceil((wp * (1 + extraPct / 100)) / r.panel_wattage) : 0;

  // ---- Bill of Quantities — everything here is BASIC cost (pre-GST) ----------
  // Every line takes its COST rate from a rate-assumption CATEGORY the operator
  // selects (panel / inverter / structure / bos / civil / labour / transport),
  // so the BOQ and the rate assumptions are always linked — the system never
  // guesses the rate from the free-text description. 'manual' = type the rate.
  const contingency_amount = 0;
  // Scope of supply — the operator can drop panels, inverter or I&C entirely.
  // Out-of-scope categories are removed from the rates, the BOQ and the totals.
  const scope = normalizeScope(input.scope);
  const panelUnitRate = panelBasis === 'watt' ? round(r.panel_rate_per_watt * r.panel_wattage) : round(r.panel_rate);
  const catRate = {
    inverter: scope.inverter ? (Number(r.inverter_rate) || 0) : 0,
    structure: Number(r.structure_rate) || 0,
    bos: Number(r.bos_rate) || 0,
    civil: Number(r.civil_rate) || 0,
    labour: scope.inc ? (Number(r.labour_rate) || 0) : 0,
    transport: Number(r.transport_rate) || 0,
  };
  const ctx = { wp, panelCount, panelUnitRate, catRate, wattage: r.panel_wattage, extraPct, scope };

  const hasCustom = Array.isArray(input.custom_items)
    && input.custom_items.some((x) => String(x.description ?? x.item ?? '').trim());
  const specs = hasCustom ? input.custom_items : defaultSpecs(type, transportIncluded, scope);
  const items = specs
    .map((s) => costLine(s, ctx))
    .filter((i) => i.item && (i.cost_amount > 0 || i.category === 'manual'));
  for (const e of normalizeExtras(input.custom_extras, wp, panelCount)) {
    items.push({ item: e.item, category: 'manual', qty: e.qty, unit: e.unit, cost_rate: e.rate, cost_amount: e.amount, note: e.note });
  }

  const subtotal = round(items.reduce((s, i) => s + i.cost_amount, 0));         // BASIC actuals
  let margin_amount = round(subtotal * (Number(r.margin_pct) || 0) / 100);
  const margin_distribution = allocateMargin(items, margin_amount, input.margin_dist); // folds margin into each line
  const taxable_amount = round(items.reduce((s, i) => s + i.amount, 0));        // BASIC + margin
  margin_amount = round(taxable_amount - subtotal);
  const cost_amount = subtotal;

  // GST is added ON TOP of the basic taxable value — it is a pass-through to the
  // government, so we quote / measure per-watt on the BASIC price, not on GST.
  const gst_pct = Number(input.gst_pct) || r.gst_pct;
  const gst_amount = Number(input.gst_amount) > 0 ? round(input.gst_amount) : round(taxable_amount * (gst_pct / 100));
  const total_amount = round(taxable_amount + gst_amount);
  const per_watt_basic = wp > 0 ? round(taxable_amount / wp) : 0;   // ₹/W on BASIC price (what we quote on)
  const per_watt = wp > 0 ? round(total_amount / wp) : 0;           // ₹/W incl. GST

  // Subsidy + return-on-investment (savings use the operator's tariff & yield)
  const subsidy_amount = type === 'residential'
    ? residentialSubsidy(kw)
    : round(r.subsidy_amount || 0);
  const net_cost = round(total_amount - subsidy_amount);
  const annual_generation = round(kw * r.generation_per_kw_year);
  const annual_savings = round(annual_generation * r.tariff_per_kwh);
  const payback_years = annual_savings > 0 ? round(net_cost / annual_savings) : 0;
  const lifetime_savings = round(annual_savings * 25);

  return {
    inputs: r,
    project_type: type,
    capacity_kw: kw,
    panel_count: panelCount,
    line_items: items,
    subtotal,
    contingency_amount,
    cost_amount,
    margin_amount,
    margin_distribution,
    taxable_amount,
    gst_amount,
    total_amount,
    per_watt,
    per_watt_basic,
    subsidy_amount,
    net_cost,
    annual_generation,
    annual_savings,
    payback_years,
    lifetime_savings,
    co2_offset_tonnes: round(annual_generation * 0.00071 * 25), // ~0.71 kg CO2/kWh over 25y
  };
}

function line(item, qty, unit, rate, amount, note) {
  return { item, qty: round(qty), unit, rate: round(rate), amount: round(amount), note };
}

// The default BOQ line specs (each tagged with the rate-assumption category it
// draws its cost from). The operator can rename any description freely — the
// category, not the text, decides the rate.
export const RATE_CATEGORIES = [
  { key: 'panel', label: 'Solar Modules', hint: '₹ per watt × wattage → per module' },
  { key: 'inverter', label: 'Inverter', hint: '₹ per watt' },
  { key: 'structure', label: 'Mounting Structure', hint: '₹ per watt' },
  { key: 'bos', label: 'Cabling + Earthing + BOS', hint: '₹ per watt' },
  { key: 'civil', label: 'Civil Work', hint: '₹ per watt' },
  { key: 'labour', label: 'Installation & Commissioning', hint: '₹ per watt' },
  { key: 'transport', label: 'Transportation', hint: '₹ per watt' },
  { key: 'manual', label: 'Manual (type the rate)', hint: 'rate you type = basic cost' },
];

// Scope of supply: which of the three gated blocks we actually provide.
// Defaults to all in-scope. `panel` → solar modules, `inverter` → inverter,
// `inc` → installation, testing & commissioning (labour).
export function normalizeScope(s) {
  const on = (v) => v !== false && String(v).toLowerCase() !== 'false';
  const o = s || {};
  return { panel: on(o.panel), inverter: on(o.inverter), inc: on(o.inc) };
}
// A category is "gated off" when its scope block is unchecked.
function outOfScope(cat, scope) {
  return (cat === 'panel' && !scope.panel) || (cat === 'inverter' && !scope.inverter) || (cat === 'labour' && !scope.inc);
}

function defaultSpecs(type, transportIncluded, scope = { panel: true, inverter: true, inc: true }) {
  return [
    ...(scope.panel ? [{ categories: ['panel'], description: 'Solar PV Modules' }] : []),
    ...(scope.inverter ? [{ categories: ['inverter'], description: 'Inverter', unit: 'Set' }] : []),
    { categories: ['structure'], description: type === 'ground_mount' ? 'Mounting Structure (ground)' : 'Mounting Structure' },
    { categories: ['bos'], description: 'Cabling, Earthing & Balance of System' },
    { categories: ['civil'], description: 'Civil Work' },
    ...(scope.inc ? [{ categories: ['labour'], description: 'Installation, Testing & Commissioning' }] : []),
    ...(transportIncluded ? [] : [{ categories: ['transport'], description: 'Transportation' }]),
  ];
}

// Turn one line spec into a BASIC-cost line. The rate comes from the selected
// categories (never from the description). A line may combine SEVERAL categories
// (e.g. structure + cabling in one line); their per-watt rates add up. With no
// category selected the line is 'manual' and uses the typed rate as cost.
function costLine(spec, ctx) {
  const { wp, panelCount, panelUnitRate, catRate, wattage, extraPct, scope = { panel: true, inverter: true, inc: true } } = ctx;
  const item = String(spec.description ?? spec.item ?? '').trim();
  // accept `categories: []` (new), or a single `category` (back-compat)
  const raw = Array.isArray(spec.categories) && spec.categories.length
    ? spec.categories
    : (spec.category ? [spec.category] : []);
  const cats = [...new Set(raw.map((c) => String(c).toLowerCase()))]
    .filter((c) => (c === 'panel' || c in catRate) && !outOfScope(c, scope));  // drop unknown / manual / out-of-scope
  let qty = Number(spec.qty) || 0;
  let unit = String(spec.unit || '').trim();
  let note = String(spec.note || '').trim();
  let cost_amount, cost_rate;
  if (!cats.length) {
    // manual — the typed rate is the basic cost (per unit, or per watt for a Wp unit)
    qty = qty > 0 ? qty : 1;
    unit = unit || 'Lot';
    const rt = Number(spec.rate) || 0;
    cost_amount = /w(p|att)?$/i.test(unit) ? wp * rt : qty * rt;
    cost_rate = qty > 0 ? cost_amount / qty : cost_amount;
  } else {
    const onlyPanel = cats.length === 1 && cats[0] === 'panel';
    let panelPart = 0, wattPart = 0;
    for (const c of cats) {
      if (c === 'panel') panelPart += panelCount * panelUnitRate;
      else wattPart += wp * catRate[c];
    }
    cost_amount = panelPart + wattPart;
    if (onlyPanel) { qty = qty > 0 ? qty : panelCount; unit = unit || 'Nos'; if (!note) note = `${wattage} Wp${extraPct ? ` · incl. ${extraPct}% extra` : ''}`; }
    else { qty = qty > 0 ? qty : 1; unit = unit || 'Lot'; }
    cost_rate = qty > 0 ? cost_amount / qty : cost_amount;
  }
  const categories = cats.length ? cats : ['manual'];
  return { item, category: categories[0], categories, qty: round(qty), unit, cost_rate: round(cost_rate), cost_amount: round(cost_amount), note };
}

// Operator-defined margin distribution. Each entry loads a share of the margin
// onto lines of a chosen rate-category bucket (or 'other' = anything else). The
// default matches the historic 40% civil / 40% installation / 20% rest.
export const MARGIN_BUCKETS = [
  { key: 'panel', label: 'Modules' }, { key: 'inverter', label: 'Inverter' },
  { key: 'structure', label: 'Structure' }, { key: 'bos', label: 'Cabling + BOS' },
  { key: 'civil', label: 'Civil Work' }, { key: 'labour', label: 'Installation & Commissioning' },
  { key: 'transport', label: 'Transport' }, { key: 'other', label: 'Other items' },
];
const MARGIN_LABEL = Object.fromEntries(MARGIN_BUCKETS.map((b) => [b.key, b.label]));
const DEFAULT_MARGIN_DIST = [{ key: 'civil', pct: 40 }, { key: 'labour', pct: 40 }, { key: 'other', pct: 20 }];

function normalizeMarginDist(raw) {
  if (!Array.isArray(raw)) return DEFAULT_MARGIN_DIST;
  const clean = raw
    .map((d) => ({ key: String(d.key || '').toLowerCase(), pct: Number(d.pct) || 0 }))
    .filter((d) => (d.key === 'other' || MARGIN_LABEL[d.key]) && d.pct > 0);
  return clean.length ? clean : DEFAULT_MARGIN_DIST;
}

// Fold the margin into each line's amount + rate, per the (configurable) split.
// Each line is assigned to exactly ONE bucket (first matching in config order,
// else 'other'); the full margin is always spread across whichever configured
// buckets actually have lines. Mutates items; returns the realised split.
function allocateMargin(items, margin, distRaw) {
  items.forEach((i) => { i.margin_amount = 0; });
  const cfg = normalizeMarginDist(distRaw);
  const assign = (i) => {
    const cats = i.categories || (i.category ? [i.category] : []);
    for (const d of cfg) { if (d.key !== 'other' && cats.includes(d.key)) return d.key; }
    return 'other';
  };
  const groups = {};
  items.forEach((i) => { const b = assign(i); (groups[b] = groups[b] || []).push(i); });
  const active = cfg.filter((d) => (groups[d.key] || []).length && d.pct > 0);
  const totalPct = active.reduce((s, d) => s + d.pct, 0) || 1;
  if (margin > 0) {
    for (const d of active) {
      const list = groups[d.key];
      const amt = margin * (d.pct / totalPct);
      const s = list.reduce((a, i) => a + i.cost_amount, 0);
      list.forEach((i) => { i.margin_amount += amt * (s > 0 ? i.cost_amount / s : 1 / list.length); });
    }
  }
  items.forEach((i) => {
    i.margin_amount = round(i.margin_amount);
    i.amount = round(i.cost_amount + i.margin_amount);
    i.rate = i.qty > 0 ? round(i.amount / i.qty) : i.amount;
  });
  const sum = (list) => round((list || []).reduce((a, i) => a + i.margin_amount, 0));
  return active.map((d) => ({ key: d.key, bucket: MARGIN_LABEL[d.key] || d.key, target_pct: round(d.pct / totalPct * 100), amount: sum(groups[d.key]) }));
}

// Extra/optional works added on top of the auto BOQ (e.g. transformer, DG sync).
// basis: 'watt' → rate × system watts; 'module' → rate × module count; else qty × rate.
function normalizeExtras(list, wp, panelCount) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => {
    const name = String(x.name ?? x.description ?? '').trim();
    if (!name) return null;
    const unit = (String(x.unit ?? 'Lot').trim()) || 'Lot';
    const basis = String(x.basis ?? '').toLowerCase();
    const qty = Number(x.qty) || 1;
    const rate = Number(x.rate) || 0;
    let amount;
    if (basis === 'watt') amount = wp * rate;
    else if (basis === 'module') amount = panelCount * rate;
    else amount = qty * rate;
    return line(name, qty, unit, rate, round(amount), String(x.note ?? '').trim());
  }).filter(Boolean);
}
function labelType(t) {
  return ({ rooftop: 'Rooftop', ground_mount: 'Ground Mount', industrial: 'Industrial', commercial: 'Commercial' })[t] || 'Rooftop';
}
// Keep only numeric rate overrides from the input payload.
function clean(input) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (input[k] !== undefined && input[k] !== null && input[k] !== '' && !Number.isNaN(Number(input[k]))) {
      out[k] = Number(input[k]);
    }
  }
  return out;
}
