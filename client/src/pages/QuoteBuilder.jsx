import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, FileDown, CheckCircle2, GitBranch, FolderPlus, ChevronDown, Undo2, Trash2, Calculator, Copy } from 'lucide-react';
import { api, apiError, download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, Loading, Badge, Field } from '../components/ui/index.jsx';
import { inr } from '../lib/format.js';

const PROJECT_TYPES = [
  { v: 'residential', l: 'Residential' },
  { v: 'rooftop', l: 'Rooftop Solar' },
  { v: 'commercial', l: 'Commercial' },
  { v: 'industrial', l: 'Industrial' },
  { v: 'institutional', l: 'Institutional' },
  { v: 'government', l: 'Government' },
  { v: 'ground_mount', l: 'Ground Mount' },
  { v: 'utility', l: 'Utility-Scale' },
];

// All work rates are ₹ PER WATT (₹/W). e.g. ₹4/W on a 25 kWp system = ₹4 × 25,000.
const RATE_FIELDS = [
  ['panel_wattage', 'Panel Wattage (Wp)'],
  ['inverter_rate', 'Inverter (₹/W)'],
  ['structure_rate', 'Structure (₹/W)'],
  ['bos_rate', 'Cabling + Earthing + BOS (₹/W)'],
  ['civil_rate', 'Civil (₹/W)'],
  ['labour_rate', 'Installation & Commissioning (₹/W)'],
  ['margin_pct', 'My Margin (%)'],
  ['gst_pct', 'GST (%)'],
  ['tariff_per_kwh', 'Grid Tariff (₹/unit)'],
  ['generation_per_kw_year', 'Annual Yield (kWh/kW/yr)'],
  ['subsidy_amount', 'Subsidy override (₹)'],
];

// Standard defaults the operator can load and then edit (mirror the PDF defaults).
const STD_SCHEDULE = [
  { pct: '30%', stage: 'Advance', against: 'Along with the confirmed Purchase Order' },
  { pct: '60%', stage: 'On Material Readiness', against: 'Against readiness of modules, inverter & BOS for dispatch (prior to delivery)' },
  { pct: '5%', stage: 'On Installation', against: 'On completion of mechanical installation at site' },
  { pct: '5%', stage: 'On Commissioning', against: 'On successful testing, commissioning & handover' },
];
// Payment, scope and warranty have their own sections, so they are not repeated
// here (avoids duplication/contradiction in the PDF).
const STD_TERMS = [
  { title: 'GST & Taxes', body: 'GST is charged extra at prevailing rates as applicable on the date of invoicing, over and above the quoted value.' },
  { title: 'Warranty', body: 'Solar modules and inverter carry the respective manufacturer / brand warranty and are supplied as per the requirement of the client.' },
  { title: 'Delivery & Timeline', body: 'Delivery and commissioning commence from receipt of the advance, a technically clear order and continuous unobstructed site access.' },
  { title: 'Insurance', body: 'Transit and erection-all-risk cover, where required, is arranged at actuals. The client shall insure the plant after handover.' },
  { title: 'Force Majeure', body: 'Neither party shall be liable for delay or non-performance due to events beyond reasonable control.' },
  { title: 'Jurisdiction & Confidentiality', body: 'This quotation is confidential, remains our property, and any dispute is subject to the jurisdiction of the courts at our registered office.' },
];
const STD_SCOPE_OURS = 'Design, engineering, drawings & SLD\nSupply of modules, inverter & BOS as per client requirement\nMounting structure, DC/AC cabling, earthing & lightning protection\nInstallation, testing & commissioning\nDISCOM liaison & net-metering application\nDatasheets, test certificates & O&M orientation';
const STD_SCOPE_CLIENT = 'Clear, secure, shadow-free site with structural adequacy\nConstruction power & water and safe storage at site\nSanctioned load details, latest electricity bill & KYC\nDISCOM deposits, feasibility & statutory fees (at actuals)\nTimely release of payments as per the agreed schedule';
const STD_EXCL = 'Anything not expressly listed under our scope, or agreed by us in writing, is client scope and chargeable at actuals.\nDISCOM deposits, metering charges and any statutory / approval fees are at actuals.';
const STD_WARRANTY = [
  { component: 'Solar Modules', spec: 'As per client requirement', warranty: 'As per manufacturer’s product & performance warranty' },
  { component: 'Inverter', spec: 'As per client requirement', warranty: 'As per manufacturer’s warranty' },
  { component: 'Mounting Structure', spec: 'Hot-dip galvanised / GI', warranty: 'Against corrosion, as per make' },
  { component: 'Workmanship (EPC)', spec: 'Ingenieria installation', warranty: 'As mutually agreed' },
];

const blankForm = {
  client_id: '', client_name: '', project_name: '', site_name: '',
  project_type: 'residential', capacity_kw: '5',
  location: '', valid_until: '', notes: '', terms: '', exclusions: '',
  branch_id: '',
};

export default function QuoteBuilder() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const { data: clients } = useFetch('/clients');
  const { data: branches } = useFetch('/gst/branches');

  const [form, setForm] = useState(blankForm);
  const [rates, setRates] = useState({});
  const [calc, setCalc] = useState(null);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showRates, setShowRates] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [pinputs, setPinputs] = useState({});
  const [docMenu, setDocMenu] = useState(false);
  const [useCustom, setUseCustom] = useState(false);
  const [customItems, setCustomItems] = useState([]);
  const [showTerms, setShowTerms] = useState(false);
  const [calc2, setCalc2] = useState({ w: 0, wp: 545 });   // little panel-rate calculator
  const [marginDist, setMarginDist] = useState([{ key: 'civil', pct: 40 }, { key: 'labour', pct: 40 }, { key: 'other', pct: 20 }]);
  const debounceRef = useRef(null);
  const docMenuRef = useRef(null);

  // Scope of supply: solar panels / inverter / I&C. All on by default; the
  // operator can drop any. Gated categories vanish from rates, BOQ and the quote.
  const scope = { panel: pinputs.scope_panel !== false, inverter: pinputs.scope_inverter !== false, inc: pinputs.scope_inc !== false };
  const toggleScope = (k) => setPinputs((p) => ({ ...p, [`scope_${k}`]: !(p[`scope_${k}`] !== false) }));
  const scopeGated = (cat) => (cat === 'panel' && !scope.panel) || (cat === 'inverter' && !scope.inverter) || (cat === 'labour' && !scope.inc);

  // close the documents menu on outside click
  useEffect(() => {
    if (!docMenu) return;
    const onClick = (e) => { if (docMenuRef.current && !docMenuRef.current.contains(e.target)) setDocMenu(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [docMenu]);

  // Load existing quote
  useEffect(() => {
    if (isNew) return;
    api.get(`/quotes/${id}`).then(({ data }) => {
      setQuote(data);
      setForm({
        client_id: data.client_id || '', client_name: data.client_name || '',
        project_name: data.project_name || '', site_name: data.site_name || '',
        project_type: data.project_type || 'rooftop', capacity_kw: String(data.capacity_kw || ''),
        location: data.location || '', valid_until: data.valid_until ? data.valid_until.slice(0, 10) : '',
        notes: data.notes || '', terms: data.terms || '', exclusions: data.exclusions || '',
        branch_id: data.branch_id || '',
      });
      setRates({
        ...(data.inputs || {}),
        panel_rate_basis: data.proposal_inputs?.panel_rate_basis || 'module',
        transport_included: data.proposal_inputs?.transport_included !== false,
        custom_extras: Array.isArray(data.proposal_inputs?.custom_extras) ? data.proposal_inputs.custom_extras : [],
      });
      setPinputs(data.proposal_inputs || {});
      if (Array.isArray(data.proposal_inputs?.margin_dist) && data.proposal_inputs.margin_dist.length) setMarginDist(data.proposal_inputs.margin_dist);
      setUseCustom(!!data.proposal_inputs?._custom_boq);
      setCustomItems((data.line_items || []).map(lineToItem));
    }).catch((e) => toast.error(apiError(e))).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Live calculation (debounced)
  const recalc = useCallback((f, r, ci, md, sc) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/quotes/calculate', {
          ...r, capacity_kw: Number(f.capacity_kw || 0), project_type: f.project_type,
          custom_items: ci && ci.length ? ci : undefined,
          margin_dist: Array.isArray(md) && md.length ? md : undefined,
          scope: sc,
        });
        setCalc(data);
      } catch { /* ignore transient */ }
    }, 300);
  }, []);

  useEffect(() => { recalc(form, rates, useCustom ? customItems : null, marginDist, scope); },
    [form.capacity_kw, form.project_type, rates, useCustom, customItems, marginDist, scope.panel, scope.inverter, scope.inc, recalc]);

  // BOQ rate categories — each line draws its cost from the matching rate
  // assumption (never guessed from the description text). Keep in sync with the
  // server's RATE_CATEGORIES in quote-calc.service.js.
  const RATE_CATS = [
    ['panel', 'Modules'], ['inverter', 'Inverter'], ['structure', 'Structure'],
    ['bos', 'Cabling + BOS'], ['civil', 'Civil'], ['labour', 'Install & Comm.'], ['transport', 'Transport'],
  ];

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // Keep the raw string while typing so decimals like "0.5" or "4.2" can be
  // entered freely (Number() would strip a trailing ".", forcing the spinner).
  // The server coerces every rate via Number() in its clean() step.
  const setRate = (k) => (e) => setRates((r) => ({ ...r, [k]: e.target.value === '' ? undefined : e.target.value }));
  const setPI = (k) => (e) => setPinputs((p) => ({ ...p, [k]: e.target.value === '' ? undefined : e.target.value }));

  // repeatable-row helpers for structured proposal_inputs (schedule, terms…)
  const piArr = (k) => (Array.isArray(pinputs[k]) ? pinputs[k] : []);
  const addRow = (k, blank) => setPinputs((p) => ({ ...p, [k]: [...(Array.isArray(p[k]) ? p[k] : []), blank] }));
  const updRow = (k, i, f, v) => setPinputs((p) => ({ ...p, [k]: (p[k] || []).map((r, j) => (j === i ? { ...r, [f]: v } : r)) }));
  const delRow = (k, i) => setPinputs((p) => ({ ...p, [k]: (p[k] || []).filter((_, j) => j !== i) }));

  const payload = () => ({
    ...rates,
    client_id: form.client_id || null,
    client_name: form.client_name || clients?.find((c) => c.id === form.client_id)?.name || null,
    project_name: form.project_name, site_name: form.site_name,
    project_type: form.project_type, capacity_kw: Number(form.capacity_kw || 0),
    location: form.location, valid_until: form.valid_until || null,
    notes: form.notes, terms: form.terms, exclusions: form.exclusions,
    branch_id: form.branch_id || null,
    custom_items: useCustom && customItems.length ? customItems : undefined,
    margin_dist: marginDist,
    scope,
    proposal_inputs: {
      ...pinputs, project_type: form.project_type, capacity_kw: Number(form.capacity_kw || 0),
      _custom_boq: useCustom,
      panel_rate_basis: rates.panel_rate_basis || 'module',
      transport_included: rates.transport_included !== false,
      custom_extras: Array.isArray(rates.custom_extras) ? rates.custom_extras : [],
      margin_dist: marginDist,
    },
  });

  // extra-work rows live in `rates.custom_extras` (flow to the calc via recalc)
  const extras = Array.isArray(rates.custom_extras) ? rates.custom_extras : [];
  const setExtras = (arr) => setRates((r) => ({ ...r, custom_extras: arr }));
  const addExtra = () => setExtras([...extras, { name: '', basis: 'watt', qty: 1, unit: 'Lot', rate: 0 }]);
  const updExtra = (i, k, v) => setExtras(extras.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const delExtra = (i) => setExtras(extras.filter((_, j) => j !== i));

  // ---- custom BOQ line-item helpers ----
  const BOQ_UNITS = ['Nos', 'Set', 'Lot', 'Wp', 'kWp', 'RM', 'Mtr', 'Sqm', 'LS'];
  // one calc line → one editable BOQ row (carries the selected rate categories)
  function lineToItem(li) {
    const cats = Array.isArray(li.categories) ? li.categories.filter((c) => c !== 'manual')
      : (li.category && li.category !== 'manual' ? [li.category] : []);
    return { description: li.item, categories: cats, qty: li.qty, unit: li.unit, rate: cats.length ? undefined : (li.cost_rate ?? li.rate), note: li.note };
  }
  const updItem = (i, k, v) => setCustomItems((arr) => arr.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  // toggle one rate category on/off for a line (multi-select)
  const toggleCat = (i, key) => setCustomItems((arr) => arr.map((it, j) => {
    if (j !== i) return it;
    const cur = Array.isArray(it.categories) ? it.categories : (it.category ? [it.category] : []);
    return { ...it, categories: cur.includes(key) ? cur.filter((c) => c !== key) : [...cur, key], category: undefined };
  }));
  const addItem = () => setCustomItems((arr) => [...arr, { description: '', categories: [], qty: 1, unit: 'Lot', rate: 0 }]);
  const delItem = (i) => setCustomItems((arr) => arr.filter((_, j) => j !== i));
  // margin-distribution buckets (mirror server MARGIN_BUCKETS) + editing helpers
  const MARGIN_BUCKETS = [['panel', 'Modules'], ['inverter', 'Inverter'], ['structure', 'Structure'], ['bos', 'Cabling + BOS'], ['civil', 'Civil'], ['labour', 'Install & Comm.'], ['transport', 'Transport'], ['other', 'Other items']];
  const toggleMarginBucket = (key) => setMarginDist((arr) => arr.some((x) => x.key === key) ? arr.filter((x) => x.key !== key) : [...arr, { key, pct: 0 }]);
  const setMarginBucketPct = (key, pct) => setMarginDist((arr) => arr.map((x) => (x.key === key ? { ...x, pct: Number(pct) || 0 } : x)));
  const marginPctTotal = marginDist.reduce((s, d) => s + (Number(d.pct) || 0), 0);
  const toggleCustom = () => setUseCustom((on) => {
    if (!on && customItems.length === 0 && c.line_items) setCustomItems(c.line_items.map(lineToItem));
    return !on;
  });
  const loadDefaults = () => {
    if (customItems.length && !window.confirm('Load the standard BOQ? This will replace all the custom line items you have entered.')) return;
    if (c.line_items) setCustomItems(c.line_items.map(lineToItem));
  };
  const watts = Number(form.capacity_kw || 0) * 1000;
  const itemAmount = (it) => (String(it.unit).toLowerCase() === 'wp' && !(Number(it.qty) > 0) ? watts * Number(it.rate || 0) : Number(it.qty || 0) * Number(it.rate || 0));

  // Compute each BOQ line client-side, mirroring the server engine, so the
  // "assumed cost → +margin → final" columns update instantly. Keep the defaults
  // and 40/40/20 split in sync with server/src/services/quote-calc.service.js.
  const RATE_DEFAULTS = { panel_wattage: 545, panel_rate: 11990, panel_rate_per_watt: 22, extra_module_pct: 0, inverter_rate: 4.2, structure_rate: 3.5, bos_rate: 4, labour_rate: 2.5, transport_rate: 0.5, margin_pct: 15 };
  const CIVIL_BY_TYPE = { residential: 0.5, rooftop: 0.6, commercial: 0.9, institutional: 0.9, government: 1.0, industrial: 1.5, ground_mount: 3.2, utility: 3.2 };
  const boqRows = (() => {
    const eff = (k) => (rates[k] !== undefined && rates[k] !== '' && !Number.isNaN(Number(rates[k])) ? Number(rates[k]) : RATE_DEFAULTS[k]);
    const wattage = eff('panel_wattage') || 545;
    const count = watts > 0 ? Math.ceil((watts * (1 + (eff('extra_module_pct') || 0) / 100)) / wattage) : 0;
    const panelUnit = (rates.panel_rate_basis === 'watt') ? Math.round(eff('panel_rate_per_watt') * wattage) : eff('panel_rate');
    const civil = rates.civil_rate !== undefined && rates.civil_rate !== '' ? Number(rates.civil_rate) : (CIVIL_BY_TYPE[form.project_type] ?? CIVIL_BY_TYPE.rooftop);
    const catRate = { inverter: scope.inverter ? eff('inverter_rate') : 0, structure: eff('structure_rate'), bos: eff('bos_rate'), civil, labour: scope.inc ? eff('labour_rate') : 0, transport: eff('transport_rate') };
    const fmtW = watts.toLocaleString('en-IN');
    const rows = customItems.map((it) => {
      const cats = (Array.isArray(it.categories) ? it.categories : (it.category ? [it.category] : []))
        .map((c) => String(c).toLowerCase()).filter((c) => (c === 'panel' || c in catRate) && !scopeGated(c));
      let qty = Number(it.qty) || 0; const unit = it.unit || 'Lot'; let cost; let formula = '';
      if (!cats.length) {
        qty = qty > 0 ? qty : 1; const rt = Number(it.rate) || 0;
        cost = /w(p|att)?$/i.test(unit) ? watts * rt : qty * rt;
      } else {
        const onlyPanel = cats.length === 1 && cats[0] === 'panel';
        let panelPart = 0, wattSum = 0; const parts = [];
        for (const c of cats) {
          if (c === 'panel') { panelPart += count * panelUnit; parts.push(`${count} × ₹${panelUnit.toLocaleString('en-IN')}`); }
          else wattSum += catRate[c] || 0;
        }
        cost = panelPart + watts * wattSum;
        if (wattSum > 0) parts.push(`₹${(Math.round(wattSum * 100) / 100)}/W × ${fmtW}`);
        formula = parts.join(' + ');
        qty = qty > 0 ? qty : (onlyPanel ? count : 1);
      }
      return { cats, qty, cost, formula, margin: 0, it };
    });
    const subtotal = rows.reduce((s, r) => s + r.cost, 0);
    const margin = subtotal * (eff('margin_pct') || 0) / 100;
    // margin split — mirror the server's allocateMargin (configurable buckets)
    const cfg = (Array.isArray(marginDist) ? marginDist : [])
      .map((d) => ({ key: String(d.key || '').toLowerCase(), pct: Number(d.pct) || 0 }))
      .filter((d) => d.pct > 0);
    const useCfg = cfg.length ? cfg : [{ key: 'civil', pct: 40 }, { key: 'labour', pct: 40 }, { key: 'other', pct: 20 }];
    const assign = (r) => { for (const d of useCfg) { if (d.key !== 'other' && r.cats.includes(d.key)) return d.key; } return 'other'; };
    const groups = {}; rows.forEach((r) => { const b = assign(r); (groups[b] = groups[b] || []).push(r); });
    const active = useCfg.filter((d) => (groups[d.key] || []).length && d.pct > 0);
    const totalPct = active.reduce((s, d) => s + d.pct, 0) || 1;
    if (margin > 0) {
      for (const d of active) {
        const list = groups[d.key]; const amt = margin * (d.pct / totalPct);
        const s = list.reduce((a, r) => a + r.cost, 0);
        list.forEach((r) => { r.margin += amt * (s > 0 ? r.cost / s : 1 / list.length); });
      }
    }
    rows.forEach((r) => { r.amount = r.cost + r.margin; r.finalRate = r.qty > 0 ? r.amount / r.qty : r.amount; r.costRate = r.qty > 0 ? r.cost / r.qty : r.cost; });
    return rows;
  })();
  // BOQ running totals (basic) — mirror the engine, shown under the table
  const boqTotals = (() => {
    const cost = boqRows.reduce((s, r) => s + r.cost, 0);
    const margin = boqRows.reduce((s, r) => s + (r.margin || 0), 0);
    return { cost, margin, taxable: cost + margin };
  })();

  const save = async () => {
    if (!form.capacity_kw || Number(form.capacity_kw) <= 0) return toast.error('Enter a valid system size');
    setSaving(true);
    try {
      if (isNew) {
        const { data } = await api.post('/quotes', payload());
        toast.success(`Quotation ${data.quote_number} created`);
        navigate(`/quotes/${data.id}`);
      } else {
        const { data } = await api.patch(`/quotes/${id}`, payload());
        setQuote(data);
        toast.success('Quotation updated');
      }
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };

  const doAction = async (verb, label) => {
    try {
      const { data } = await api.post(`/quotes/${id}/${verb}`);
      toast.success(label);
      if (verb === 'convert') navigate(`/projects/${data.project.id}`);
      else if (verb === 'revise' || verb === 'duplicate') navigate(`/quotes/${data.id}`);
      else setQuote(data);
    } catch (e) { toast.error(apiError(e)); }
  };

  // Undo an approval / conversion — asks WHY, then reverts the quote to draft.
  const undoApproval = async () => {
    const remark = window.prompt('Undo this approval and send the quote back to draft?\n\nPlease say why (e.g. "client changed the scope"):');
    if (remark === null) return;                       // cancelled
    if (!remark.trim()) { toast.error('A remark is required to undo.'); return; }
    try {
      const { data } = await api.post(`/quotes/${id}/undo`, { remark: remark.trim() });
      setQuote(data.quote);
      toast.success(
        data.projectRemoved ? 'Reverted to draft · linked project moved to Recovery Center'
        : data.projectKept ? 'Reverted to draft · linked project had activity and was kept'
        : 'Reverted to draft'
      );
    } catch (e) { toast.error(apiError(e)); }
  };

  if (loading) return <Loading />;
  const c = calc || {};

  return (
    <div>
      <button onClick={() => navigate('/quotes')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600">
        <ArrowLeft size={16} /> Back to quotes
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isNew ? 'New Quotation' : quote?.quote_number}{quote?.version > 1 ? ` · Rev ${quote.version}` : ''}
          </h1>
          {quote && <div className="mt-1"><Badge status={quote.status} /></div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} {isNew ? 'Create' : 'Save'}
          </button>
          {!isNew && (
            <>
              <div className="relative" ref={docMenuRef}>
                <button className="btn-ghost" onClick={() => setDocMenu((v) => !v)}>
                  <FileDown size={16} /> Documents <ChevronDown size={14} />
                </button>
                {docMenu && (
                  <div className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                    {[
                      { label: 'Complete Package', sub: 'Proposal + Quotation + BOQ', pdf: `/quotes/${id}/document.pdf`, star: true },
                      { label: 'Proposal (Brochure)', sub: 'Premium sales document', pdf: `/quotes/${id}/proposal.pdf` },
                      { label: 'Commercial Quotation', sub: 'Priced offer, scope & terms', pdf: `/quotes/${id}/quotation.pdf`, docx: `/quotes/${id}/quotation.docx` },
                      { label: 'Bill of Quantities', sub: 'Component-level breakdown', pdf: `/quotes/${id}/boq.pdf`, docx: `/quotes/${id}/boq.docx` },
                      { label: 'Proposal + Quotation', sub: 'Sales + pricing', pdf: `/quotes/${id}/document.pdf?parts=proposal,quotation` },
                      { label: 'Quotation + BOQ', sub: 'Full commercial set', pdf: `/quotes/${id}/document.pdf?parts=quotation,boq`, docx: `/quotes/${id}/document.docx?parts=quotation,boq` },
                    ].map((d) => (
                      <div key={d.label} className={`flex items-stretch ${d.star ? 'bg-brand-50/60 dark:bg-brand-900/20' : ''}`}>
                        <button
                          onClick={() => { setDocMenu(false); download(d.pdf); }}
                          className="flex flex-1 flex-col items-start gap-0.5 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        >
                          <span className={`text-sm font-semibold ${d.star ? 'text-brand-700 dark:text-brand-300' : 'text-slate-800 dark:text-slate-100'}`}>{d.label}</span>
                          <span className="text-xs text-slate-500">{d.sub}</span>
                        </button>
                        {d.docx && (
                          <button
                            onClick={() => { setDocMenu(false); download(d.docx); }}
                            title="Download as editable Word (.docx)"
                            className="my-2 mr-2 shrink-0 self-center rounded-md border border-brand-200 px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/30"
                          >Word</button>
                        )}
                      </div>
                    ))}
                    <div className="border-t border-slate-100 px-4 py-1.5 text-[11px] text-slate-400 dark:border-slate-700">
                      Tap a row for PDF. <span className="font-semibold text-brand-600 dark:text-brand-300">Word</span> (editable) is available for the Quotation &amp; BOQ.
                    </div>
                  </div>
                )}
              </div>
              {quote?.status !== 'approved' && quote?.status !== 'converted' && (
                <button className="btn-ghost" onClick={() => doAction('approve', 'Quote approved')}><CheckCircle2 size={16} /> Approve</button>
              )}
              {(quote?.status === 'approved' || quote?.status === 'converted') && (
                <button className="btn-ghost text-amber-600 hover:text-amber-700" onClick={undoApproval}><Undo2 size={16} /> Undo</button>
              )}
              <button className="btn-ghost" onClick={() => doAction('duplicate', 'Duplicated to a new quotation')}><Copy size={16} /> Duplicate</button>
              <button className="btn-ghost" onClick={() => doAction('revise', 'New revision created')}><GitBranch size={16} /> Revise</button>
              {quote?.status !== 'converted' && (
                <button className="btn-ghost" onClick={() => doAction('convert', 'Converted to project')}><FolderPlus size={16} /> Convert</button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Inputs */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Project Details</h3>
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Office &amp; Billing GST</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Select Office">
                  <select className="input" value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}>
                    <option value="">— Select Office —</option>
                    {branches?.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} — {b.gstin}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Billing GSTIN">
                  <input className="input bg-slate-50 dark:bg-slate-800/60 cursor-default" readOnly value={branches?.find((b) => b.id === form.branch_id)?.gstin || ''} placeholder="Auto-filled from office" />
                </Field>
              </div>
              <p className="mt-1 text-xs text-slate-400">The selected office's GST and address appear on the quotation PDF header.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client">
                <select className="input" value={form.client_id} onChange={set('client_id')}>
                  <option value="">Select / free text</option>
                  {clients?.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                </select>
              </Field>
              <Field label="Client Name (if not listed)"><input className="input" value={form.client_name} onChange={set('client_name')} /></Field>
              <Field label="Project Name"><input className="input" value={form.project_name} onChange={set('project_name')} /></Field>
              <Field label="Site Name"><input className="input" value={form.site_name} onChange={set('site_name')} /></Field>
              <Field label="Project Type">
                <select className="input" value={form.project_type} onChange={set('project_type')}>
                  {PROJECT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
              </Field>
              <Field label="System Size (kW)" required><input className="input" type="number" value={form.capacity_kw} onChange={set('capacity_kw')} /></Field>
              <Field label="Location"><input className="input" value={form.location} onChange={set('location')} /></Field>
              <Field label="Valid Until"><input className="input" type="date" value={form.valid_until} onChange={set('valid_until')} /></Field>
            </div>
          </Card>

          <Card>
            <button className="flex w-full items-center justify-between font-semibold text-slate-800 dark:text-slate-100" onClick={() => setShowProposal((s) => !s)}>
              <span>Proposal Details <span className="ml-1 text-xs font-normal text-slate-400">— customises the proposal PDF</span></span>
              <ChevronDown size={18} className={`transition ${showProposal ? 'rotate-180' : ''}`} />
            </button>
            {showProposal && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Field label="Installation">
                  <select className="input" value={pinputs.install_type || ''} onChange={setPI('install_type')}>
                    <option value="">—</option><option>Rooftop</option><option>Ground-Mount</option><option>Solar Carport</option>
                  </select>
                </Field>
                <Field label="Grid Type">
                  <select className="input" value={pinputs.grid_type || ''} onChange={setPI('grid_type')}>
                    <option value="">—</option><option>On-Grid</option><option>Off-Grid</option><option>Hybrid</option>
                  </select>
                </Field>
                <Field label="Sector">
                  <select className="input" value={pinputs.sector || ''} onChange={setPI('sector')}>
                    <option value="">—</option><option>Private</option><option>Government</option><option>PSU</option>
                  </select>
                </Field>
                <Field label="Battery Backup">
                  <select className="input" value={pinputs.battery || ''} onChange={setPI('battery')}>
                    <option value="">—</option><option>No</option><option>Yes</option>
                  </select>
                </Field>
                <Field label="Net Metering">
                  <select className="input" value={pinputs.net_metering || ''} onChange={setPI('net_metering')}>
                    <option value="">—</option><option>Yes</option><option>No</option>
                  </select>
                </Field>
                <Field label="Monitoring">
                  <select className="input" value={pinputs.monitoring || ''} onChange={setPI('monitoring')}>
                    <option value="">—</option><option>Yes</option><option>No</option>
                  </select>
                </Field>
                <Field label="State"><input className="input" value={pinputs.state || ''} onChange={setPI('state')} /></Field>
                <Field label="DISCOM"><input className="input" value={pinputs.discom || ''} onChange={setPI('discom')} placeholder="e.g. WBSEDCL" /></Field>
                <Field label="Monthly Bill (₹)"><input className="input" type="number" value={pinputs.monthly_bill || ''} onChange={setPI('monthly_bill')} /></Field>
                <Field label="Warranty"><input className="input" value={pinputs.warranty || ''} onChange={setPI('warranty')} placeholder="e.g. 25 yr modules" /></Field>
                <Field label="AMC / O&M"><input className="input" value={pinputs.amc || ''} onChange={setPI('amc')} placeholder="e.g. 5 yr" /></Field>
                <Field label="Timeline"><input className="input" value={pinputs.timeline || ''} onChange={setPI('timeline')} placeholder="e.g. 6–8 weeks" /></Field>
                <Field label="Subsidy"><input className="input" value={pinputs.subsidy || ''} onChange={setPI('subsidy')} placeholder="e.g. PM Surya Ghar" /></Field>
                <div className="col-span-2">
                  <Field label="Client Address (up to 5 lines)">
                    <textarea className="input min-h-[64px]" rows={3} value={pinputs.client_address || ''} onChange={setPI('client_address')} placeholder="One line per address line" />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Special Requirements">
                    <textarea className="input min-h-[48px]" rows={2} value={pinputs.special_requirements || ''} onChange={setPI('special_requirements')} />
                  </Field>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <button className="flex w-full items-center justify-between font-semibold text-slate-800 dark:text-slate-100" onClick={() => setShowRates((s) => !s)}>
              <span>Rate Assumptions</span>
              <ChevronDown size={18} className={`transition ${showRates ? 'rotate-180' : ''}`} />
            </button>
            {showRates && (
              <div className="mt-4 space-y-3">
                {/* Scope of supply — gates rates, BOQ and the quotation */}
                <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900/40 dark:bg-brand-900/10">
                  <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Scope of Supply <span className="text-xs font-normal text-slate-400">— what we provide in this quote</span></div>
                  <div className="flex flex-wrap gap-2">
                    {[['panel', 'Solar Panels Supply'], ['inverter', 'Inverter Supply'], ['inc', 'I&C Work']].map(([k, label]) => (
                      <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${scope[k] ? 'border-brand-400 bg-white text-slate-700 dark:border-brand-500 dark:bg-slate-800 dark:text-slate-200' : 'border-slate-200 text-slate-400 dark:border-slate-700'}`}>
                        <input type="checkbox" checked={scope[k]} onChange={() => toggleScope(k)} /> {label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">Uncheck what you're not doing — it drops out of the rate assumptions, the BOQ and the quotation entirely.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Panel Rate Basis">
                    <select className="input disabled:opacity-40" disabled={!scope.panel} value={rates.panel_rate_basis || 'module'} onChange={(e) => setRates((r) => ({ ...r, panel_rate_basis: e.target.value }))}>
                      <option value="module">Per module (₹/panel)</option>
                      <option value="watt">Per watt (₹/W)</option>
                    </select>
                  </Field>
                  {rates.panel_rate_basis === 'watt'
                    ? <Field label="Panel Rate (₹/W)"><input className="input disabled:opacity-40" disabled={!scope.panel} type="text" inputMode="decimal" value={rates.panel_rate_per_watt ?? ''} onChange={setRate('panel_rate_per_watt')} placeholder="22" /></Field>
                    : <Field label="Panel Rate (₹/module)"><input className="input disabled:opacity-40" disabled={!scope.panel} type="text" inputMode="decimal" value={rates.panel_rate ?? ''} onChange={setRate('panel_rate')} placeholder="11990" /></Field>}
                  {/* Panel-rate calculator: ₹/W × wattage → ₹/module */}
                  <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Calculator size={12} /> Panel Rate Calculator</div>
                    <div className="flex flex-wrap items-end gap-2 text-xs">
                      <label className="flex flex-col gap-0.5"><span className="text-slate-400">₹ / Watt</span><input className="input w-20 !py-1.5 text-right" type="text" inputMode="decimal" value={calc2.w} onChange={(e) => setCalc2((s) => ({ ...s, w: e.target.value }))} placeholder="17" /></label>
                      <span className="pb-2 text-slate-400">×</span>
                      <label className="flex flex-col gap-0.5"><span className="text-slate-400">Wattage (Wp)</span><input className="input w-20 !py-1.5 text-right" type="text" inputMode="decimal" value={calc2.wp} onChange={(e) => setCalc2((s) => ({ ...s, wp: e.target.value }))} placeholder="545" /></label>
                      <span className="pb-2 text-slate-400">=</span>
                      <div className="pb-0.5"><div className="text-slate-400">₹ / panel</div><div className="text-sm font-bold text-brand-600 dark:text-brand-300">{inr(Math.round((Number(calc2.w) || 0) * (Number(calc2.wp) || 0)))}</div></div>
                      <button type="button" onClick={() => setRates((r) => ({ ...r, panel_rate_basis: 'watt', panel_rate_per_watt: calc2.w, panel_wattage: calc2.wp }))} className="ml-auto rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium hover:bg-white dark:border-slate-600 dark:hover:bg-slate-700">Use as panel rate</button>
                    </div>
                  </div>
                  <Field label="Extra Modules (%)"><input className="input" type="text" inputMode="decimal" value={rates.extra_module_pct ?? ''} onChange={setRate('extra_module_pct')} placeholder="0" /></Field>
                  <Field label="Transportation">
                    <select className="input" value={rates.transport_included === false ? 'no' : 'yes'} onChange={(e) => setRates((r) => ({ ...r, transport_included: e.target.value === 'yes' }))}>
                      <option value="yes">Included in price</option>
                      <option value="no">Charged extra</option>
                    </select>
                  </Field>
                  {rates.transport_included === false && (
                    <Field label="Transport (₹/W)"><input className="input" type="text" inputMode="decimal" value={rates.transport_rate ?? ''} onChange={setRate('transport_rate')} placeholder="0.5" /></Field>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {RATE_FIELDS.map(([k, label]) => {
                    const gateKey = k === 'inverter_rate' ? 'inverter' : k === 'labour_rate' ? 'inc' : null;
                    const off = gateKey && !scope[gateKey];
                    return (
                      <Field key={k} label={off ? `${label} — not in scope` : label}>
                        <input className="input disabled:opacity-40" disabled={off} type="text" inputMode="decimal" value={off ? '' : (rates[k] ?? (c.inputs ? c.inputs[k] : ''))} onChange={setRate(k)} placeholder={off ? '—' : (c.inputs ? String(c.inputs[k]) : '')} />
                      </Field>
                    );
                  })}
                </div>

                {/* Margin distribution — where your margin % is loaded (tick + set share) */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Margin distribution</span>
                    <span className={`text-xs font-medium ${marginPctTotal === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{marginPctTotal}%{marginPctTotal !== 100 ? ' · normalised to 100%' : ''}</span>
                  </div>
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-500">Tick where your <b>{rates.margin_pct ?? c.inputs?.margin_pct ?? 15}%</b> margin should be loaded and set each share. It is folded into those BOQ items only — never shown to the client. <b>Other items</b> = everything not ticked above.</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MARGIN_BUCKETS.map(([key, label]) => {
                      const on = marginDist.some((d) => d.key === key);
                      const d = marginDist.find((x) => x.key === key);
                      return (
                        <div key={key} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${on ? 'border-amber-300 bg-white dark:border-amber-700 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-700'}`}>
                          <input type="checkbox" className="h-3.5 w-3.5" checked={on} onChange={() => toggleMarginBucket(key)} />
                          <span className="flex-1 text-xs text-slate-600 dark:text-slate-300">{label}</span>
                          <input type="text" inputMode="decimal" disabled={!on} value={on ? (d.pct ?? '') : ''} onChange={(e) => setMarginBucketPct(key, e.target.value)} className="input w-12 !px-1.5 !py-1 text-right text-xs disabled:opacity-40" placeholder="%" />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Extra Work (optional)</span>
                    <button type="button" onClick={addExtra} className="text-xs font-medium text-brand-600 hover:underline">+ Add extra work</button>
                  </div>
                  {extras.length === 0 && <p className="text-xs text-slate-400">e.g. step-up transformer, DG synchronisation, HT works — added to the BOQ.</p>}
                  <div className="space-y-2">
                    {extras.map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input className="input flex-[4] !py-1.5 text-xs" placeholder="Extra work name" value={r.name || ''} onChange={(e) => updExtra(i, 'name', e.target.value)} />
                        <select className="input flex-[2] !py-1.5 text-xs" value={r.basis || 'watt'} onChange={(e) => updExtra(i, 'basis', e.target.value)}>
                          <option value="watt">Per watt</option>
                          <option value="module">Per module</option>
                          <option value="unit">Lump / unit</option>
                        </select>
                        {r.basis === 'unit' && <input className="input w-14 !py-1.5 text-right text-xs" type="number" placeholder="Qty" value={r.qty ?? ''} onChange={(e) => updExtra(i, 'qty', e.target.value)} />}
                        <input className="input flex-[1.6] !py-1.5 text-right text-xs" type="text" inputMode="decimal" placeholder="Rate ₹" value={r.rate ?? ''} onChange={(e) => updExtra(i, 'rate', e.target.value)} />
                        <button type="button" onClick={() => delExtra(i)} className="px-1 text-slate-400 hover:text-red-500">×</button>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">All work rates are ₹ <b>per watt</b> — e.g. ₹4/W on 25 kWp = ₹1,00,000. Modules bill per Nos; other work as a lump (Set/Lot). These are your <b>cost</b> rates — your margin below is added on top and folded into the BOQ item rates.</p>
              </div>
            )}
          </Card>

          {/* Bill of Quantities is rendered full-width below the grid for readability */}

          <Card>
            <button className="flex w-full items-center justify-between font-semibold text-slate-800 dark:text-slate-100" onClick={() => setShowTerms((s) => !s)}>
              <span>Commercial Terms & Company</span>
              <ChevronDown size={18} className={`transition ${showTerms ? 'rotate-180' : ''}`} />
            </button>
            {showTerms && (
              <div className="mt-4 space-y-5">
                <div>
                  <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">System Configuration <span className="text-xs font-normal text-slate-400">— shown on the quotation</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Solar Module"><input className="input text-xs" value={pinputs.module_config || ''} onChange={setPI('module_config')} placeholder="545 Wp Mono PERC / latest equivalent" disabled={!scope.panel} /></Field>
                    <Field label="Panel Type">
                      <select className="input text-xs" value={pinputs.panel_type || ''} onChange={setPI('panel_type')}>
                        <option value="">Not specified</option>
                        <option value="DCR">DCR (Domestic Content Requirement)</option>
                        <option value="Non-DCR">Non-DCR (imported cells allowed)</option>
                      </select>
                    </Field>
                    <Field label="Inverter"><input className="input text-xs" value={pinputs.inverter_config || ''} onChange={setPI('inverter_config')} placeholder="3-phase grid-tie string inverter (as per design)" disabled={!scope.inverter} /></Field>
                    <Field label="Mounting (MMS)"><input className="input text-xs" value={pinputs.mms_config || ''} onChange={setPI('mms_config')} placeholder="Aluminium / GI structure suitable for rooftop" /></Field>
                    <Field label="System"><input className="input text-xs" value={pinputs.system_config || ''} onChange={setPI('system_config')} placeholder="Grid-connected rooftop solar system" /></Field>
                    <Field label="Total DC Capacity (kWp)"><input className="input text-xs" type="number" value={pinputs.dc_capacity || ''} onChange={setPI('dc_capacity')} placeholder="optional · usually > AC" /></Field>
                    <Field label="Net Metering">
                      <select className="input text-xs" value={pinputs.net_metering || 'not_included'} onChange={setPI('net_metering')}>
                        <option value="not_included">Not included</option>
                        <option value="included">Included</option>
                      </select>
                    </Field>
                    <Field label="Battery Backup">
                      <select className="input text-xs" value={pinputs.battery_backup || 'not_included'} onChange={setPI('battery_backup')}>
                        <option value="not_included">Not included</option>
                        <option value="included">Included</option>
                      </select>
                    </Field>
                  </div>
                </div>

                <Field label="Name of Work (blank = standard)">
                  <input className="input" value={pinputs.commercial_scope || ''} onChange={setPI('commercial_scope')} placeholder="Design, Engineering, Supply, Installation, Testing & Commissioning of …" />
                </Field>

                <Field label="Extra Technical Requirements / Notes (optional)">
                  <textarea className="input min-h-[56px]" value={form.notes} onChange={set('notes')} placeholder="Any extra technical notes for the client — printed after the exclusions on the quotation. Leave blank to omit." />
                </Field>

                {/* GST treatment */}
                <Field label="GST Treatment">
                  <select className="input" value={pinputs.gst_split || 'cgst_sgst'} onChange={setPI('gst_split')}>
                    <option value="cgst_sgst">Intra-state — CGST + SGST</option>
                    <option value="igst">Inter-state — IGST</option>
                  </select>
                </Field>

                {/* Payment schedule */}
                <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Payment Schedule</span>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setPinputs((p) => ({ ...p, payment_schedule: STD_SCHEDULE }))} className="text-xs font-medium text-slate-500 hover:underline">Load standard</button>
                      <button type="button" onClick={() => addRow('payment_schedule', { pct: '', stage: '', against: '' })} className="text-xs font-medium text-brand-600 hover:underline">+ Add milestone</button>
                    </div>
                  </div>
                  {piArr('payment_schedule').length === 0 && <p className="text-xs text-slate-400">Blank = standard 30% adv · 60% material readiness · 5% installation · 5% commissioning. Click <b>Load standard</b> to edit it.</p>}
                  <div className="space-y-2">
                    {piArr('payment_schedule').map((r, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <input className="input w-16 !py-1.5 text-xs" value={r.pct || ''} onChange={(e) => updRow('payment_schedule', i, 'pct', e.target.value)} placeholder="30%" />
                        <input className="input flex-[2] !py-1.5 text-xs" value={r.stage || ''} onChange={(e) => updRow('payment_schedule', i, 'stage', e.target.value)} placeholder="Stage" />
                        <input className="input flex-[3] !py-1.5 text-xs" value={r.against || ''} onChange={(e) => updRow('payment_schedule', i, 'against', e.target.value)} placeholder="Against / note" />
                        <button type="button" onClick={() => delRow('payment_schedule', i)} className="px-1 text-slate-400 hover:text-red-500">×</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Terms & Conditions (title + body) */}
                <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Terms &amp; Conditions</span>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setPinputs((p) => ({ ...p, terms: STD_TERMS }))} className="text-xs font-medium text-slate-500 hover:underline">Load standard</button>
                      <button type="button" onClick={() => addRow('terms', { title: '', body: '' })} className="text-xs font-medium text-brand-600 hover:underline">+ Add term</button>
                    </div>
                  </div>
                  {piArr('terms').length === 0 && <p className="text-xs text-slate-400">Blank = standard PI-based terms. Click <b>Load standard</b> to edit them, or add your own as Title + description.</p>}
                  <div className="space-y-2">
                    {piArr('terms').map((r, i) => (
                      <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                        <div className="flex items-center gap-1.5">
                          <input className="input flex-1 !py-1.5 text-xs font-medium" value={r.title || ''} onChange={(e) => updRow('terms', i, 'title', e.target.value)} placeholder="Title (e.g. Payment)" />
                          <button type="button" onClick={() => delRow('terms', i)} className="px-1 text-slate-400 hover:text-red-500">×</button>
                        </div>
                        <textarea className="input mt-1.5 min-h-[44px] text-xs" value={r.body || ''} onChange={(e) => updRow('terms', i, 'body', e.target.value)} placeholder="Description — e.g. All payments strictly against Proforma Invoice; tax invoice after payment received." />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scope of Work (Arrays + Client) + Exclusions */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Scope of Work</span>
                  <button type="button" onClick={() => setPinputs((p) => ({ ...p, scope_ours: STD_SCOPE_OURS, scope_client: STD_SCOPE_CLIENT, exclusions: STD_EXCL }))} className="text-xs font-medium text-slate-500 hover:underline">Load standard</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Our Scope (one per line)"><textarea className="input min-h-[80px] text-xs" value={pinputs.scope_ours || ''} onChange={setPI('scope_ours')} placeholder={'Design, engineering & SLD\nSupply & installation…'} /></Field>
                  <Field label="Client Scope (one per line)"><textarea className="input min-h-[80px] text-xs" value={pinputs.scope_client || ''} onChange={setPI('scope_client')} placeholder={'Site access, power & water…'} /></Field>
                </div>
                <Field label="Exclusions (one per line, blank = standard)">
                  <textarea className="input min-h-[50px] text-xs" value={pinputs.exclusions || ''} onChange={setPI('exclusions')} placeholder={STD_EXCL} />
                </Field>

                {/* Warranty & specification (Quality page) */}
                <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Warranty &amp; Specification</span>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setPinputs((p) => ({ ...p, warranty_rows: STD_WARRANTY }))} className="text-xs font-medium text-slate-500 hover:underline">Load standard</button>
                      <button type="button" onClick={() => addRow('warranty_rows', { component: '', spec: '', warranty: '' })} className="text-xs font-medium text-brand-600 hover:underline">+ Add row</button>
                    </div>
                  </div>
                  {piArr('warranty_rows').length === 0 && <p className="text-xs text-slate-400">Blank = standard (as per manufacturer). Click <b>Load standard</b> to edit.</p>}
                  <div className="space-y-2">
                    {piArr('warranty_rows').map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input className="input flex-[2] !py-1.5 text-xs" placeholder="Component" value={r.component || ''} onChange={(e) => updRow('warranty_rows', i, 'component', e.target.value)} />
                        <input className="input flex-[3] !py-1.5 text-xs" placeholder="Specification" value={r.spec || ''} onChange={(e) => updRow('warranty_rows', i, 'spec', e.target.value)} />
                        <input className="input flex-[3] !py-1.5 text-xs" placeholder="Warranty" value={r.warranty || ''} onChange={(e) => updRow('warranty_rows', i, 'warranty', e.target.value)} />
                        <button type="button" onClick={() => delRow('warranty_rows', i)} className="px-1 text-slate-400 hover:text-red-500">×</button>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400 dark:bg-slate-800/60">GSTIN is taken from the selected office. The company bank account &amp; payment-method note are fixed in the PDF (not entered here).</p>
              </div>
            )}
          </Card>
        </div>

        {/* Live estimate */}
        <div className="lg:col-span-3">
          <Card className="!p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Live Estimate</h3>
              <span className="text-sm text-slate-400">{c.panel_count || 0} modules · {c.capacity_kw || 0} kW</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="th">Item</th><th className="th text-right">Qty</th>
                    <th className="th text-right">Rate</th><th className="th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(c.line_items || []).map((li) => (
                    <tr key={li.item}>
                      <td className="td"><div className="font-medium text-slate-700 dark:text-slate-200">{li.item}</div><div className="text-xs text-slate-400">{li.note}</div></td>
                      <td className="td text-right">{li.qty} {li.unit}</td>
                      <td className="td text-right">{inr(li.rate)}</td>
                      <td className="td text-right font-medium">{inr(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1.5 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
              {[
                ['Subtotal (basic actuals)', c.subtotal], ['Contingency', c.contingency_amount],
                ['Margin', c.margin_amount],
              ].filter(([l, v]) => Number(v) > 0 || l.startsWith('Subtotal')).map(([l, v]) => (
                <div key={l} className="flex justify-between text-sm">
                  <span className="text-slate-500">{l}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{inr(v)}</span>
                </div>
              ))}
              {/* Taxable value = the BASIC price we quote & measure per-watt on */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-sm dark:border-slate-800">
                <span className="font-medium text-slate-600 dark:text-slate-300">Taxable Value <span className="text-slate-400">(basic)</span></span>
                <div className="text-right">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{inr(c.taxable_amount)}</div>
                  <div className="text-xs text-slate-400">{c.per_watt_basic ? `₹${c.per_watt_basic}/W basic` : ''}</div>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">GST</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{inr(c.gst_amount)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-600 px-4 py-3 text-white">
                <span className="font-semibold">Grand Total <span className="text-xs font-normal text-brand-100">incl. GST</span></span>
                <div className="text-right">
                  <div className="text-lg font-bold">{inr(c.total_amount)}</div>
                  <div className="text-xs text-brand-100">{c.per_watt ? `₹${c.per_watt}/W incl GST` : ''}</div>
                </div>
              </div>
              {Number(c.subsidy_amount) > 0 && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
                  <div>
                    <div className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">Net after subsidy</div>
                    <div className="text-xs text-emerald-600">Subsidy {inr(c.subsidy_amount)}</div>
                  </div>
                  <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{inr(c.net_cost)}</span>
                </div>
              )}
            </div>
          </Card>

          {Number(c.annual_savings) > 0 && (
            <Card className="mt-4">
              <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Return on Investment</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Annual Savings', inr(c.annual_savings)],
                  ['Payback', `${c.payback_years} yrs`],
                  ['25-yr Savings', inr(c.lifetime_savings)],
                  ['Net Investment', inr(c.net_cost || c.total_amount)],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                    <div className="text-[11px] font-semibold uppercase text-slate-400">{l}</div>
                    <div className="mt-1 text-base font-bold text-brand-600 dark:text-brand-300">{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Operator-only: your margin (never shown to the client) */}
          {Number(c.margin_amount) > 0 && (
            <Card className="mt-4 border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-900/10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">My Margin</div>
                  <div className="text-xs text-slate-500">Internal only — distributed into the BOQ rates, never shown to the client.</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-300">{inr(c.margin_amount || 0)}</div>
                  <div className="text-xs text-slate-400">{c.subtotal ? `${(c.margin_amount / c.subtotal * 100).toFixed(1)}% on cost ${inr(c.subtotal)}` : ''}</div>
                </div>
              </div>
              {Array.isArray(c.margin_distribution) && c.margin_distribution.length > 0 && (
                <div className="mt-3 border-t border-amber-200/60 pt-2 dark:border-amber-900/40">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80">How it's folded into the BOQ</div>
                  {c.margin_distribution.map((d) => (
                    <div key={d.bucket} className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{d.bucket} <span className="text-slate-400">· {d.target_pct}%</span></span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">{inr(d.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Bill of Quantities — full width so every amount is readable */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Bill of Quantities</h3>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={useCustom} onChange={toggleCustom} /> Custom items (type your own lines)
          </label>
        </div>
        {!useCustom ? (
          <p className="mt-2 text-xs text-slate-400">Auto-generated from the rate assumptions and system size — the full breakdown is in the Live Estimate above. Enable <b>Custom items</b> to write your own descriptions and pick which rate assumption each line draws from.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="text-left align-bottom text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-7 pb-2 font-semibold">#</th>
                  <th className="w-[24%] pb-2 font-semibold">Description <span className="normal-case text-slate-300">(on PDF)</span></th>
                  <th className="w-[24%] pb-2 pl-2 font-semibold">Rate from <span className="normal-case text-slate-300">(tick one or more)</span></th>
                  <th className="w-24 pb-2 pl-2 text-right font-semibold">Qty</th>
                  <th className="w-20 pb-2 pl-2 font-semibold">Unit</th>
                  <th className="w-32 pb-2 pl-2 text-right font-semibold">Rate (assumed)</th>
                  <th className="w-24 pb-2 pl-2 text-right font-semibold">+ Margin</th>
                  <th className="w-32 pb-2 pl-2 text-right font-semibold">Amount (basic)</th>
                  <th className="w-9 pb-2" />
                </tr>
              </thead>
              <tbody>
                {customItems.map((it, i) => {
                  const r = boqRows[i] || {};
                  const cats = Array.isArray(it.categories) ? it.categories : (it.category ? [it.category] : []);
                  const isManual = cats.length === 0;
                  return (
                    <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                      <td className="py-2 pr-1 text-slate-400">{i + 1}</td>
                      <td className="py-2 pr-2"><textarea rows={2} className="input w-full resize-y !py-2 leading-snug" placeholder="e.g. DC/AC cabling, connectors, earthing, LA, panel protection cable…" value={it.description || ''} onChange={(e) => updItem(i, 'description', e.target.value)} /></td>
                      <td className="py-2 pl-2">
                        <div className="flex flex-wrap gap-1">
                          {RATE_CATS.map(([k, label]) => {
                            const on = cats.includes(k);
                            const gated = scopeGated(k);   // out of scope of supply
                            // a category may be used on only one line — disable it elsewhere
                            const taken = !on && customItems.some((o, j) => j !== i && (Array.isArray(o.categories) ? o.categories : (o.category ? [o.category] : [])).includes(k));
                            const off = gated || taken;
                            return (
                              <label key={k} title={gated ? 'Not in scope of supply' : taken ? 'Already used in another line' : ''} className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] ${off ? 'cursor-not-allowed border-slate-100 text-slate-300 dark:border-slate-800 dark:text-slate-600' : on ? 'cursor-pointer border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-300' : 'cursor-pointer border-slate-200 text-slate-500 dark:border-slate-700'}`}>
                                <input type="checkbox" className="h-3 w-3" checked={on && !gated} disabled={off} onChange={() => toggleCat(i, k)} />{label}
                              </label>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2 pl-2"><input className="input w-full !py-2 !px-2 text-right" type="text" inputMode="numeric" placeholder={r.qty ? String(r.qty) : ''} value={it.qty ?? ''} onChange={(e) => updItem(i, 'qty', e.target.value.replace(/[^0-9.]/g, ''))} /></td>
                      <td className="py-2 pl-2"><select className="input w-full !py-2" value={it.unit || 'Lot'} onChange={(e) => updItem(i, 'unit', e.target.value)}>{BOQ_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap">
                        {isManual
                          ? <input className="input w-full !py-2 text-right" type="text" inputMode="decimal" placeholder="type cost ₹" value={it.rate ?? ''} onChange={(e) => updItem(i, 'rate', e.target.value)} />
                          : <div><div className="font-medium text-slate-600 dark:text-slate-300">{inr(r.cost)}</div>{r.formula && <div className="text-[10px] leading-tight text-slate-400">{r.formula}</div>}</div>}
                      </td>
                      <td className="py-2 pl-2 text-right text-xs text-emerald-600 whitespace-nowrap">{r.margin ? '+' + inr(r.margin) : '—'}</td>
                      <td className="py-2 pl-2 text-right font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{inr(r.amount)}</td>
                      <td className="py-2 text-right"><button type="button" onClick={() => delItem(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20" title="Remove item"><Trash2 size={15} /></button></td>
                    </tr>
                  );
                })}
                {!customItems.length && (
                  <tr><td colSpan={9} className="py-6 text-center text-sm text-slate-400">No line items yet — click <b>Add item</b> or <b>Load standard items</b>.</td></tr>
                )}
              </tbody>
              {customItems.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 dark:border-slate-700">
                  <tr className="text-sm">
                    <td colSpan={5} className="py-2 pr-2 text-right font-medium text-slate-500">Subtotal — basic actuals</td>
                    <td className="py-2 pl-2 text-right text-slate-600 dark:text-slate-300">{inr(boqTotals.cost)}</td>
                    <td className="py-2 pl-2 text-right text-emerald-600">{boqTotals.margin ? '+' + inr(boqTotals.margin) : '—'}</td>
                    <td className="py-2 pl-2 text-right font-medium text-slate-700 dark:text-slate-200">{inr(boqTotals.cost)}</td>
                    <td />
                  </tr>
                  <tr className="text-sm">
                    <td colSpan={7} className="py-2 pr-2 text-right font-semibold text-slate-700 dark:text-slate-200">Total (basic, before GST)</td>
                    <td className="py-2 pl-2 text-right text-base font-bold text-brand-700 dark:text-brand-300">{inr(boqTotals.taxable)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={addItem} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">+ Add item</button>
              <button type="button" onClick={loadDefaults} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Load standard items</button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              Write any <b>Description</b> for the client (it wraps to multiple lines), then <b>tick one or more</b> rate categories — their assumed rates add up (e.g. Structure ₹3.5/W + Cabling ₹4/W = ₹7.5/W × system watts). <b>Rate (assumed)</b> is your actual cost with the working shown; <b>+ Margin</b> is your markup folded in; <b>Amount</b> is the final <b>basic</b> price (GST added afterward). Tick nothing to <b>type a manual rate</b>.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
