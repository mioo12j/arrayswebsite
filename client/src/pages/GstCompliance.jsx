import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Search, FileText, Truck, Loader2, Download, FileJson, ShieldCheck,
  CheckCircle2, XCircle, Ban, Copy, Archive, Trash2, RefreshCw, Link2, AlertTriangle, ScanLine, FileMinus2,
} from 'lucide-react';
import { pincodeToState } from '../lib/pincode.js';
import { todayISO } from '../lib/format.js';
import PortalUploadButton from '../components/gst/PortalUpload.jsx';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useBranch } from '../context/BranchContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Badge, Table, Field, DescList, DescRow } from '../components/ui/index.jsx';
import {
  einvStatus, ewbStatus, inr, dmy, dmyt, gstDownload, blankItem, recalcInvoice,
} from '../lib/gst.js';
import Attachments from '../components/gst/Attachments.jsx';
import OtpModal from '../components/gst/OtpModal.jsx';
import VersionHistory from '../components/gst/VersionHistory.jsx';
import Discussion from '../components/gst/Discussion.jsx';
import SavedViews from '../components/gst/SavedViews.jsx';
import { CheckCircle, XOctagon } from 'lucide-react';

function DrawerSection({ title, children }) {
  return <div className="mt-6"><h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>{children}</div>;
}

const companyFallback = { gstin: '10AARCA4610L1ZT', name: 'ARRAYS INGENIERIA PRIVATE LIMITED', shortName: 'INGENIERIA', address: 'VILL: HARPUR, KALUAHI, MADHUBANI-847229, BIHAR', email: 'arraysingenieria@gmail.com' };

const EINV_STATUSES = ['draft', 'validated', 'irn_generated', 'printed', 'cancelled', 'needs_review', 'error'];
const EWB_STATUSES = ['draft', 'validated', 'part_a', 'generated', 'cancelled', 'rejected', 'closed', 'needs_review', 'error'];

export default function GstCompliance() {
  const { data: perms } = useFetch('/gst/me/permissions');
  const can = (p) => !!perms?.permissions?.includes(p);
  const mode = perms?.mode || 'simulation';
  const { data: master } = useFetch('/gst/master');

  return (
    <div>
      <PageHeader
        title="GST Compliance Workspace"
        subtitle="e-Invoices and E-Way Bills are managed as separate compliance objects, side by side."
        actions={<span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700" title="Offline filing — JSON is uploaded on the government portal">● Live</span>}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <EInvoicePanel can={can} master={master} />
        <EwbPanel can={can} master={master} />
      </div>
    </div>
  );
}

/* ════════════════════════════ e-INVOICE PANEL ════════════════════════════ */
function EInvoicePanel({ can, master }) {
  const toast = useToast();
  const { branchQS } = useBranch();
  const [filters, setFilters] = useState({ search: '', status: '', archived: '' });
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString() + (branchQS ? `&${branchQS}` : '');
  const { data: rows, loading, refetch } = useFetch(`/gst/einvoices?${qs}`, [qs]);
  const [form, setForm] = useState(null);   // create/edit
  const [detailId, setDetailId] = useState(null);

  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><FileText size={18} className="text-brand-600" /> e-Invoices</h3>
        <div className="flex gap-2">
          {can('gst.export') && <button className="btn-ghost !py-1.5 !text-sm" onClick={() => gstDownload('/gst/einvoices/portal-json', 'einvoice_bulk_portal.json')} title="Download all pending e-invoices as one JSON to upload on the GST portal"><FileJson size={15} /> Bulk JSON</button>}
          <PortalUploadButton kind="einvoice" compact />
          {can('gst.create') && <button className="btn-primary !py-1.5 !text-sm" onClick={() => setForm({})}><Plus size={15} /> New e-Invoice</button>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !py-1.5 pl-8 text-sm" placeholder="Doc no, GSTIN, customer, IRN…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <select className="input !py-1.5 max-w-[150px] text-sm" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">Any status</option>
          {EINV_STATUSES.map((s) => <option key={s} value={s}>{einvStatus(s)[1]}</option>)}
        </select>
        <select className="input !py-1.5 max-w-[130px] text-sm" value={filters.archived} onChange={(e) => setFilters((f) => ({ ...f, archived: e.target.value }))} title="Show archived e-invoices">
          <option value="">Active</option>
          <option value="true">Archived</option>
          <option value="all">All</option>
        </select>
      </div>
      <SavedViews objectType="einvoice" filters={filters} onApply={(vf) => setFilters({ search: '', status: '', ...vf })} />
      {loading ? <Loading /> : (
        <Table
          columns={[{ header: 'Doc No' }, { header: 'Customer' }, { header: 'Value', align: 'right' }, { header: 'IRN' }, { header: 'Status' }]}
          rows={rows || []}
          empty="No e-invoices yet. Click “New e-Invoice”."
          onRowClick={(r) => setDetailId(r.id)}
          renderRow={(r) => {
            const [tone, label] = einvStatus(r.status);
            return (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">{r.docNo || '—'}{r.branchCode && <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">{r.branchCode}</span>}{r.docType === 'CRN' && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">CRN</span>}<div className="text-xs font-normal text-slate-400">{dmy(r.docDate)}</div></td>
                <td className="td">{r.buyerName || '—'}<div className="font-mono text-xs text-slate-400">{r.buyerGstin || ''}</div></td>
                <td className="td text-right font-semibold">{inr(r.totalInvVal)}</td>
                <td className="td">{r.irn ? <span className="text-emerald-600" title={r.irn}><ShieldCheck size={14} className="inline" /> {String(r.irn).slice(0, 8)}…</span> : <span className="text-slate-300">—</span>}</td>
                <td className="td"><Badge tone={tone}>{label}</Badge></td>
              </>
            );
          }}
        />
      )}
      {form && <EInvoiceForm master={master} initial={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); refetch(); }} />}
      {detailId && <EInvoiceDetail id={detailId} can={can} master={master} onClose={() => setDetailId(null)} onChanged={refetch} onEdit={(rec) => { setDetailId(null); setForm(rec); }} onOpen={(nid) => setDetailId(nid)} />}
    </Card>
  );
}

function EInvoiceForm({ initial, master, onClose, onSaved }) {
  const toast = useToast();
  const { data: companyData } = useFetch('/company');
  const { data: branches } = useFetch('/gst/branches');
  const co = companyData || companyFallback;
  const sellerDefault = {
    // Trade name = legal name (no short form) — that's how this company is registered.
    gstin: co.gstin || '', legalName: co.name || '', tradeName: co.name || '', addr1: co.address || '',
    location: 'Greater Noida', pincode: '201310', stateCode: String(co.gstin || '09').slice(0, 2), phone: '', email: co.email || '',
  };
  const [form, setForm] = useState(() => initial ? structuredClone(initial) : {
    supplyType: 'B2B', docType: 'INV', docNo: '', docDate: todayISO(),
    seller: sellerDefault, buyer: { gstin: '', legalName: '', pos: '', addr1: '', location: '', pincode: '', stateCode: '' },
    headerAddress: '', items: [blankItem()], val: {},
  });
  // Letterhead (cosmetic) address options drawn from the configured offices.
  const officeAddr = (b) => [b.addr1, b.place].filter(Boolean).join(', ') + (b.pincode ? ` - ${b.pincode}` : '');
  const officeOptions = (branches || []).map((b) => ({ label: `${b.code} — ${b.name}`, addr: officeAddr(b) })).filter((o) => o.addr);
  const [saving, setSaving] = useState(false);
  const [gv, setGv] = useState(null);
  // Whether the document number is still system-suggested (so switching office
  // re-derives its prefix) vs. manually typed (which we then leave alone).
  const [autoNo, setAutoNo] = useState(!(initial?.id || initial?.docNo));
  const computed = useMemo(() => recalcInvoice(form), [form]);
  const validateGstin = async () => {
    try { const { data } = await api.post('/gst/validate-gstin', { gstin: form.buyer.gstin, name: form.buyer.legalName, pincode: form.buyer.pincode, stateCode: form.buyer.stateCode }); setGv(data); }
    catch (e) { toast.error(apiError(e)); }
  };
  const set = (path) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const n = structuredClone(f);
      const ks = path.split('.'); let o = n;
      for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
      o[ks[ks.length - 1]] = v;
      return n;
    });
  };
  const setItem = (i, k, v) => setForm((f) => { const n = structuredClone(f); n.items[i][k] = v; return n; });
  const opts = (cat) => (master?.[cat] || []);
  // Typing a pincode auto-derives the GST state code (+ state into the blank
  // Location). The user fills the street address manually.
  const setPin = (party) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const n = structuredClone(f);
      n[party].pincode = v;
      const hit = pincodeToState(v);
      if (hit) {
        n[party].stateCode = hit.stateCode;
        if (party === 'buyer') n.buyer.pos = hit.stateCode;
        if (!n[party].location) n[party].location = hit.state;
      }
      return n;
    });
  };
  const buyerPin = pincodeToState(form.buyer.pincode);
  const sellerPin = pincodeToState(form.seller.pincode);
  // Pick a configured office → fill the whole supplier block (trade name = legal name).
  const setSellerFromOffice = async (e) => {
    const b = (branches || []).find((x) => String(x.id) === e.target.value);
    if (!b) return;
    setForm((f) => ({
      ...f,
      // Bind the invoice to the SELECTED billing office so its branch (DL / BR /
      // UP …) is recorded — otherwise the server falls back to the default branch
      // and every document shows the same (UP) code.
      branchId: b.id,
      seller: {
        ...f.seller,
        gstin: b.gstin || '',
        legalName: b.legal_name || b.name || '',
        tradeName: b.legal_name || b.name || '',
        addr1: b.addr1 || '',
        location: b.place || '',
        pincode: b.pincode || '',
        stateCode: b.state_code || (b.gstin ? String(b.gstin).slice(0, 2) : ''),
        email: b.email || f.seller.email,
        phone: b.phone || f.seller.phone,
      },
    }));
    // The document-number PREFIX must follow the selected office. While the
    // number is still system-suggested, start it with this office's code (e.g.
    // picking the Bihar office yields "BR/") — the operator fills the sequence
    // in their own convention. Once they type, we stop touching it.
    if (autoNo && b.code) setForm((f) => ({ ...f, docNo: `${b.code}/` }));
  };

  const save = async (override) => {
    // GST schema requires Location/Pincode/State on both parties — block blanks
    // so the portal JSON never fails with "The Location field is required".
    const s = form.seller || {}, b = form.buyer || {};
    const need = [];
    if (!s.location) need.push('Seller Location'); if (!s.pincode) need.push('Seller Pincode'); if (!s.stateCode) need.push('Seller State Code');
    if (!b.location) need.push('Buyer Location'); if (!b.pincode) need.push('Buyer Pincode'); if (!(b.stateCode || b.pos)) need.push('Buyer State Code');
    if (need.length) { toast.error(`Required for GST: ${need.join(', ')}`); return; }
    setSaving(true);
    try {
      const payload = recalcInvoice(form);
      if (override) { payload.overrideDuplicate = true; payload.overrideReason = override; }
      if (initial?.id) { await api.patch(`/gst/einvoices/${initial.id}`, payload); toast.success('Draft updated'); }
      else { await api.post('/gst/einvoices', payload); toast.success('e-Invoice draft created'); }
      onSaved();
    } catch (e) {
      if (e?.response?.status === 409 && /already exists/i.test(apiError(e))) {
        const reason = window.prompt('A duplicate document number was detected. Type a reason to override (audited), or Cancel:');
        if (reason) { setSaving(false); return save(reason); }
      } else { toast.error(apiError(e)); }
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={initial?.id ? 'Edit e-Invoice Draft' : 'New e-Invoice'} size="xl"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Save Draft'}</button></>}>
      <Section title="Document (DocDtls / TranDtls)">
        <Field label="Supply Type"><select className="input" value={form.supplyType} onChange={set('supplyType')}>{opts('einv_supply_type').map((o) => <option key={o.code} value={o.code}>{o.code} — {o.name}</option>)}</select></Field>
        <Field label="Document Type"><select className="input" value={form.docType} onChange={set('docType')}>{opts('einv_doc_type').map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</select></Field>
        <Field label="Document No" hint={autoNo ? 'Prefix follows the selected office' : undefined}>
          <input className="input" value={form.docNo} onChange={(e) => { setAutoNo(false); set('docNo')(e); }} placeholder="Select an office → e.g. BR/06/2026-27" />
        </Field>
        <Field label="Document Date"><input className="input" type="date" value={form.docDate} onChange={set('docDate')} /></Field>
        <Field label="PO Number" hint="Buyer's purchase order — printed on the PDF only, not sent to the portal."><input className="input" value={form.poNo || ''} onChange={set('poNo')} placeholder="Optional" /></Field>
        <Field label="PO Date"><input className="input" type="date" value={form.poDate || ''} onChange={set('poDate')} /></Field>
        <Field label="Site / Delivery Address" className="sm:col-span-2 lg:col-span-3" hint="Installation/delivery site — printed on the PDF only, not sent to the portal."><textarea className="input" rows={2} value={form.siteAddress || ''} onChange={set('siteAddress')} placeholder="Optional — e.g. Tapowan, Kharagpur, West Bengal - 721301" /></Field>
      </Section>

      <Section title="Letterhead / Office Address (printed on top of the PDF)">
        <Field label="Pick an office" hint="Cosmetic only — not sent to the IRP. Editable later too.">
          <select className="input" value="" onChange={(e) => { if (e.target.value) set('headerAddress')({ target: { value: e.target.value } }); }}>
            <option value="">Choose an office address…</option>
            {officeOptions.map((o) => <option key={o.label} value={o.addr}>{o.label} — {o.addr}</option>)}
          </select>
        </Field>
        <Field label="Header address" hint={`Leave blank to use ${co.address || 'the registered address'}`}>
          <input className="input" value={form.headerAddress} onChange={set('headerAddress')} placeholder={co.address} />
        </Field>
      </Section>

      <Section title="Seller / Supplier (SellerDtls — where the supply is from)">
        <Field label="Pick supplier office" hint="Auto-fills the supplier block — or type the fields manually below.">
          <select className="input" value="" onChange={setSellerFromOffice}>
            <option value="">Choose an office… (or fill manually)</option>
            {(branches || []).filter((b) => b.gstin).map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name} ({b.gstin})</option>)}
          </select>
        </Field>
        <Field label="GSTIN"><input className="input" value={form.seller.gstin} onChange={set('seller.gstin')} /></Field>
        <Field label="Legal Name"><input className="input" value={form.seller.legalName} onChange={set('seller.legalName')} /></Field>
        <Field label="Address"><input className="input" value={form.seller.addr1} onChange={set('seller.addr1')} /></Field>
        <Field label="Location"><input className="input" value={form.seller.location} onChange={set('seller.location')} /></Field>
        <Field label="Pincode" hint={sellerPin ? `${sellerPin.stateCode} — ${sellerPin.state} (auto)` : 'Type 6 digits → state auto-fills'}>
          <input className="input" value={form.seller.pincode} onChange={setPin('seller')} inputMode="numeric" maxLength={6} />
        </Field>
        <Field label="State Code"><input className="input" value={form.seller.stateCode} onChange={set('seller.stateCode')} /></Field>
      </Section>

      <Section title="Buyer (BuyerDtls)">
        <Field label="GSTIN">
          <div className="flex gap-2">
            <input className="input" value={form.buyer.gstin} onChange={(e) => { set('buyer.gstin')(e); setGv(null); }} placeholder="29AAAAA0000A1Z5" />
            <button type="button" className="btn-ghost !px-2.5" onClick={validateGstin} title="Validate GSTIN">Check</button>
          </div>
          {gv && <p className={`mt-1 flex items-center gap-1 text-xs ${gv.result === 'valid' ? 'text-emerald-600' : gv.result === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>{gv.result === 'valid' ? <><CheckCircle size={12} /> Valid GSTIN — {gv.stateName}</> : <><XOctagon size={12} /> {gv.issues[0] || gv.result}</>}</p>}
        </Field>
        <Field label="Legal Name"><input className="input" value={form.buyer.legalName} onChange={set('buyer.legalName')} /></Field>
        <Field label="Place of Supply (state code)"><input className="input" value={form.buyer.pos} onChange={set('buyer.pos')} placeholder="29" /></Field>
        <Field label="Address"><input className="input" value={form.buyer.addr1} onChange={set('buyer.addr1')} /></Field>
        <Field label="Location"><input className="input" value={form.buyer.location} onChange={set('buyer.location')} /></Field>
        <Field label="Pincode" hint={buyerPin ? `${buyerPin.stateCode} — ${buyerPin.state} (auto)` : 'Type 6 digits → state auto-fills'}>
          <input className="input" value={form.buyer.pincode} onChange={setPin('buyer')} inputMode="numeric" maxLength={6} />
        </Field>
        <Field label="State Code"><input className="input" value={form.buyer.stateCode} onChange={set('buyer.stateCode')} /></Field>
      </Section>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-700 dark:text-slate-200">Items (ItemList)</h4>
      <div className="space-y-2">
        {form.items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <select className="input col-span-2 !py-1.5 text-sm" value={it.isService === 'Y' ? 'Y' : 'N'} title="Goods or Services"
              onChange={(e) => { const v = e.target.value; setForm((f) => { const n = structuredClone(f); n.items[i].isService = v; if (v === 'Y' && (!n.items[i].unit || n.items[i].unit === 'NOS')) n.items[i].unit = 'OTH'; return n; }); }}>
              <option value="N">Goods</option>
              <option value="Y">Services</option>
            </select>
            <input className="input col-span-2 !py-1.5 text-sm" placeholder="Description" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
            <input className="input col-span-2 !py-1.5 text-sm" placeholder={it.isService === 'Y' ? 'SAC' : 'HSN'} value={it.hsn} onChange={(e) => setItem(i, 'hsn', e.target.value)} />
            <input className="input col-span-1 !py-1.5 text-sm" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
            <input className="input col-span-1 !py-1.5 text-sm" placeholder="Unit" value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} />
            <input className="input col-span-2 !py-1.5 text-sm" type="number" placeholder="Rate" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} />
            <select className="input col-span-1 !py-1.5 text-sm" value={it.gstRate} onChange={(e) => setItem(i, 'gstRate', e.target.value)}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</select>
            <button className="col-span-1 text-red-500 hover:text-red-700" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} title="Remove"><Trash2 size={15} /></button>
          </div>
        ))}
        <button className="btn-ghost !py-1.5 !text-sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }))}><Plus size={14} /> Add item</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800 sm:grid-cols-4">
        <div><p className="text-xs text-slate-400">Assessable</p><p className="font-semibold">{inr(computed.val.assessableValue)}</p></div>
        <div><p className="text-xs text-slate-400">CGST+SGST</p><p className="font-semibold">{inr((computed.val.cgstValue || 0) + (computed.val.sgstValue || 0))}</p></div>
        <div><p className="text-xs text-slate-400">IGST</p><p className="font-semibold">{inr(computed.val.igstValue)}</p></div>
        <div><p className="text-xs text-slate-400">Total Invoice Value</p><p className="font-bold text-brand-600">{inr(computed.val.totalInvoiceValue)}</p></div>
      </div>
    </Modal>
  );
}

function EInvoiceDetail({ id, can, master, onClose, onChanged, onEdit, onOpen }) {
  const toast = useToast();
  const { data: rec, loading, refetch } = useFetch(`/gst/einvoices/${id}`, [id]);
  const { data: branches } = useFetch('/gst/branches');
  const officeAddr = (b) => [b.addr1, b.place].filter(Boolean).join(', ') + (b.pincode ? ` - ${b.pincode}` : '');
  const officeOptions = (branches || []).map((b) => ({ label: `${b.code} — ${b.name}`, addr: officeAddr(b) })).filter((o) => o.addr);
  const [busy, setBusy] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [otp, setOtp] = useState(false);
  const [irnForm, setIrnForm] = useState(null);   // offline IRN entry
  const [cnForm, setCnForm] = useState(null);     // convert-to-credit-note entry
  const [scanning, setScanning] = useState(false);
  // Cosmetic letterhead/office address — editable at any time (even post-IRN).
  const [headerAddr, setHeaderAddr] = useState('');
  const [headerDirty, setHeaderDirty] = useState(false);
  useEffect(() => { if (rec) { setHeaderAddr(rec.headerAddress || ''); setHeaderDirty(false); } }, [rec?.id, rec?.headerAddress]);
  const saveHeader = async (download) => {
    setBusy('header');
    try {
      await api.patch(`/gst/einvoices/${id}/header-address`, { headerAddress: headerAddr });
      setHeaderDirty(false);
      toast.success('Letterhead address updated');
      if (download) gstDownload(`/gst/einvoices/${id}/pdf`);
      refetch();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  // Read the QR straight from the govt signed PDF / a QR image → auto-fill IRN.
  const scanQr = async (file) => {
    if (!file) return;
    setScanning(true);
    try {
      // Lazy-load the (heavy) pdfjs-based scanner only when actually scanning.
      const { scanEInvoiceFromFile } = await import('../lib/qrScan.js');
      const p = await scanEInvoiceFromFile(file);
      if (!p.qr && !p.irn) { toast.error('No QR/IRN found — upload the signed PDF, or a clear screenshot of the QR.'); return; }
      setIrnForm((f) => ({
        irn: p.irn || f?.irn || '',
        ackNo: p.ackNo || f?.ackNo || '',
        ackDate: p.ackDate || f?.ackDate || '',
        signedQr: p.signedQr || f?.signedQr || '',
      }));
      const got = [p.irn && 'IRN', p.ackNo && 'Ack No', p.ackDate && 'Ack date'].filter(Boolean).join(', ');
      toast.success(got ? `Read ${got} — review & save` : 'QR read — review & save');
    } catch (e) { toast.error(`Could not read the QR: ${e.message || 'unknown error'}`); }
    finally { setScanning(false); }
  };
  const recordIrn = async () => {
    setBusy('IRN');
    try {
      await api.post(`/gst/einvoices/${id}/record-irn`, irnForm);
      toast.success('IRN recorded — e-Invoice finalised'); setIrnForm(null); refetch(); onChanged?.();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  const act = async (label, fn) => {
    setBusy(label);
    try { await fn(); toast.success(`${label} done`); refetch(); onChanged?.(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  // Convert this invoice into a Credit Note (CRN) draft, then OPEN it so the
  // number/date can be edited (or reverted) before the portal JSON is downloaded.
  const createCreditNote = async () => {
    setBusy('CRN');
    try {
      const { data } = await api.post(`/gst/einvoices/${id}/credit-note`, { docNo: cnForm.docNo?.trim(), docDate: cnForm.docDate });
      toast.success(`Credit note ${data.docNo || ''} created — review, then download its Portal JSON`);
      setCnForm(null); onChanged?.();
      onOpen?.(data.id);   // switch this drawer to the new credit note
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  // Reverse a credit-note draft back to a normal invoice (only before its IRN).
  const revertToInvoice = async () => {
    if (!window.confirm('Revert this credit note back to a normal tax invoice? The credit-note reference will be removed.')) return;
    setBusy('Revert');
    try { await api.post(`/gst/einvoices/${id}/revert-to-invoice`); toast.success('Reverted to a tax invoice'); refetch(); onChanged?.(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  // OTP-gated cancel: first call returns 428 → show 2FA → retry with the token.
  const doCancel = async (otpToken) => {
    setBusy('Cancel');
    try {
      await api.post(`/gst/einvoices/${id}/cancel`, { reasonCode: cancelReason, remark: 'Cancelled via workspace', otpToken });
      toast.success('IRN cancelled'); setOtp(false); refetch(); onChanged?.();
    } catch (e) {
      if (e?.response?.status === 428) setOtp(true);
      else toast.error(apiError(e));
    } finally { setBusy(''); }
  };
  // Soft-delete a draft (no IRN) → moves to the Recovery Center; closes the drawer.
  const doDelete = async () => {
    if (!window.confirm(`Delete draft “${rec.docNo || 'this e-invoice'}”? It moves to the Recovery Center and can be restored later.`)) return;
    setBusy('Delete');
    try { await api.delete(`/gst/einvoices/${id}`); toast.success('e-Invoice deleted'); onChanged?.(); onClose(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  if (loading || !rec) return <Modal open onClose={onClose} title="e-Invoice"><Loading /></Modal>;
  const [tone, label] = einvStatus(rec.status);
  const editable = ['draft', 'validated', 'needs_review', 'error'].includes(rec.status);
  const errs = (rec.validationErrors || []).filter((i) => i.severity === 'error');

  return (
    <Modal open onClose={onClose} title={`${rec.docType === 'CRN' ? 'Credit Note' : 'e-Invoice'} ${rec.docNo || ''}`} size="lg"
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
        <div><p className="text-xs uppercase text-slate-400">{rec.docType === 'CRN' ? 'Credit Note Value' : 'Total Invoice Value'}</p><p className="text-2xl font-bold text-brand-600">{inr(rec.totalInvVal)}</p></div>
        <Badge tone={tone}>{label}</Badge>
      </div>

      {/* A credit note: show the original invoice it adjusts */}
      {rec.docType === 'CRN' && rec.reference?.PrecDocDtls?.[0] && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900/40 dark:bg-amber-900/10">
          <p className="font-semibold text-amber-800 dark:text-amber-300"><FileMinus2 size={13} className="mr-1 inline" />Credit Note</p>
          <p className="mt-1 text-amber-700 dark:text-amber-400">Adjusts original tax invoice <span className="font-mono font-semibold">{rec.reference.PrecDocDtls[0].InvNo}</span> · {rec.reference.PrecDocDtls[0].InvDt}</p>
        </div>
      )}

      {/* An invoice with credit note(s) raised against it */}
      {rec.docType !== 'CRN' && (rec.creditNotes || []).length > 0 && (
        <div className="mb-4 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900/40 dark:bg-amber-900/10">
          {rec.creditNotes.map((cn) => (
            <div key={cn.id} className="flex items-center justify-between gap-2">
              <p className="text-amber-800 dark:text-amber-300">
                <FileMinus2 size={13} className="mr-1 inline" />
                <span className="font-semibold">{cn.irn ? 'Credit Note Issued' : 'Credit note (draft)'}</span>
                {' · '}<span className="font-mono">{cn.docNo}</span>{cn.irn && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">IRN</span>}
              </p>
              <button className="text-brand-600 hover:underline dark:text-brand-300" onClick={() => onOpen?.(cn.id)}>Open</button>
            </div>
          ))}
        </div>
      )}

      {rec.irn && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900/40 dark:bg-emerald-900/10">
          <p className="font-mono break-all text-emerald-800 dark:text-emerald-300"><ShieldCheck size={13} className="inline" /> IRN {rec.irn}</p>
          <p className="mt-1 text-emerald-700">Ack No {rec.ackNo} • {dmyt(rec.ackDate)}</p>
        </div>
      )}

      {errs.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/10">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-700"><AlertTriangle size={14} /> {errs.length} validation error(s)</p>
          <ul className="space-y-0.5 text-xs text-red-600">{errs.slice(0, 8).map((e, i) => <li key={i}>• {e.message}</li>)}</ul>
        </div>
      )}

      <DescList>
        <DescRow label="Supply / Doc Type">{rec.supplyType} / {rec.docType}</DescRow>
        <DescRow label="Document Date">{dmy(rec.docDate)}</DescRow>
        {(rec.poNo || rec.poDate) && <DescRow label="PO No / Date">{rec.poNo || '—'}{rec.poDate ? ` · ${dmy(rec.poDate)}` : ''}</DescRow>}
        {rec.siteAddress && <DescRow label="Site / Delivery Address">{rec.siteAddress}</DescRow>}
        <DescRow label="Seller">{rec.seller?.legalName}<div className="font-mono text-xs text-slate-400">{rec.seller?.gstin}</div></DescRow>
        <DescRow label="Buyer">{rec.buyer?.legalName}<div className="font-mono text-xs text-slate-400">{rec.buyer?.gstin}</div></DescRow>
        <DescRow label="Items">{rec.items?.length}</DescRow>
        <DescRow label="Created by">{rec.createdByName}</DescRow>
      </DescList>

      {/* Letterhead / office address — cosmetic, editable even after the IRN is locked */}
      {can('gst.edit') && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
          <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Letterhead / office address <span className="font-normal text-slate-400">— printed on the PDF header. Editable anytime; the IRN &amp; tax data stay locked.</span>
          </p>
          {officeOptions.length > 0 && (
            <select className="input mb-2 w-full !py-1.5 text-sm" value=""
              onChange={(e) => { if (e.target.value) { setHeaderAddr(e.target.value); setHeaderDirty(true); } }}>
              <option value="">Pick an office address…</option>
              {officeOptions.map((o) => <option key={o.label} value={o.addr}>{o.label} — {o.addr}</option>)}
            </select>
          )}
          <textarea className="input w-full !py-1.5 text-sm" rows={2} value={headerAddr}
            placeholder="Leave blank to use the registered company address"
            onChange={(e) => { setHeaderAddr(e.target.value); setHeaderDirty(true); }} />
          <div className="mt-2 flex gap-2">
            <button className="btn-ghost !py-1.5 !text-sm" disabled={busy === 'header' || !headerDirty} onClick={() => saveHeader(false)}>{busy === 'header' ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Update</button>
            <button className="btn-primary !py-1.5 !text-sm" disabled={busy === 'header'} onClick={() => saveHeader(true)}><Download size={14} /> Update &amp; download PDF</button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-2">
        {editable && can('gst.edit') && <button className="btn-ghost !text-sm" onClick={() => onEdit(rec)}>Edit</button>}
        {editable && can('gst.validate') && <button className="btn-ghost !text-sm" disabled={!!busy} onClick={() => act('Validate', () => api.post(`/gst/einvoices/${id}/validate`))}><CheckCircle2 size={14} /> Validate</button>}
        {!rec.irn && can('gst.download') && <button className="btn-ghost !text-sm" disabled={!!busy} onClick={() => gstDownload(`/gst/einvoices/${id}/portal-json`)}><FileJson size={14} /> Portal JSON</button>}
        {!rec.irn && can('gst.submit') && <button className="btn-primary !text-sm" disabled={!!busy} onClick={() => setIrnForm(irnForm ? null : { irn: '', ackNo: '', ackDate: '', signedQr: '' })}><ShieldCheck size={14} /> Enter IRN</button>}
        {rec.irn && can('gst.download') && <button className="btn-ghost !text-sm" onClick={() => gstDownload(`/gst/einvoices/${id}/pdf`)}><Download size={14} /> PDF</button>}
        {rec.irn && can('gst.download') && <button className="btn-ghost !text-sm" onClick={() => gstDownload(`/gst/einvoices/${id}/json`)}><FileJson size={14} /> Signed JSON</button>}
        {irnForm && (
          <div className="w-full rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900/40 dark:bg-brand-900/10">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className={`btn-ghost !text-sm cursor-pointer ${scanning ? 'pointer-events-none opacity-60' : ''}`}>
                {scanning ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
                {scanning ? 'Reading QR…' : 'Scan signed PDF / QR image'}
                <input type="file" accept="application/pdf,image/*" className="hidden" disabled={scanning}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; scanQr(f); }} />
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">Upload the government's signed PDF — the IRN &amp; QR fill in automatically.</span>
            </div>
            <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">…or paste the result from the GST portal after uploading the Portal JSON:</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input !py-1.5 text-sm col-span-2" placeholder="IRN (64 characters)" value={irnForm.irn} onChange={(e) => setIrnForm((f) => ({ ...f, irn: e.target.value.trim() }))} />
              <input className="input !py-1.5 text-sm" placeholder="Ack No" value={irnForm.ackNo} onChange={(e) => setIrnForm((f) => ({ ...f, ackNo: e.target.value }))} />
              <input className="input !py-1.5 text-sm" type="date" placeholder="Ack Date" value={irnForm.ackDate} onChange={(e) => setIrnForm((f) => ({ ...f, ackDate: e.target.value }))} />
              <input className="input !py-1.5 text-sm col-span-2" placeholder="Signed QR code (optional — enables the QR on the PDF)" value={irnForm.signedQr} onChange={(e) => setIrnForm((f) => ({ ...f, signedQr: e.target.value }))} />
            </div>
            <div className="mt-2 flex gap-2">
              <button className="btn-primary !py-1.5 !text-sm" disabled={busy === 'IRN' || !irnForm.irn} onClick={recordIrn}>{busy === 'IRN' ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Save IRN</button>
              <button className="btn-ghost !py-1.5 !text-sm" onClick={() => setIrnForm(null)}>Cancel</button>
            </div>
          </div>
        )}
        {can('gst.create') && <button className="btn-ghost !text-sm" disabled={!!busy} onClick={() => act('Duplicate', () => api.post(`/gst/einvoices/${id}/duplicate`))}><Copy size={14} /> Duplicate</button>}
        {rec.docType !== 'CRN' && can('gst.create') && (
          <button className="btn-ghost !text-sm" disabled={!!busy}
            onClick={() => setCnForm(cnForm ? null : { docNo: `${rec.branchCode ? rec.branchCode + '/' : ''}`, docDate: todayISO() })}>
            <FileMinus2 size={14} /> Convert to Credit Note
          </button>
        )}
        {rec.docType === 'CRN' && !rec.irn && editable && can('gst.edit') && (
          <button className="btn-ghost !text-sm text-amber-600 hover:text-amber-700" disabled={!!busy} onClick={revertToInvoice}>
            {busy === 'Revert' ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} Revert to Invoice
          </button>
        )}
        {cnForm && (
          <div className="w-full rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Credit Note (CRN) against invoice <span className="font-mono">{rec.docNo}</span> · {dmy(rec.docDate)}</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Credit note no"><input className="input !py-1.5 text-sm" value={cnForm.docNo} onChange={(e) => setCnForm((f) => ({ ...f, docNo: e.target.value }))} placeholder="e.g. BR/CRN/01/2026-27" /></Field>
              <Field label="Credit note date"><input className="input !py-1.5 text-sm" type="date" value={cnForm.docDate} onChange={(e) => setCnForm((f) => ({ ...f, docDate: e.target.value }))} /></Field>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Type is set to <span className="font-semibold">CRN</span> and the original invoice ({rec.docNo}, {dmy(rec.docDate)}) is recorded as the preceding document. Values copy from the invoice — edit the draft afterwards for a partial credit. The portal JSON downloads automatically.</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-primary !py-1.5 !text-sm" disabled={busy === 'CRN' || !cnForm.docNo?.trim() || !cnForm.docDate} onClick={createCreditNote}>{busy === 'CRN' ? <Loader2 className="animate-spin" size={14} /> : <FileMinus2 size={14} />} Create credit note</button>
              <button className="btn-ghost !py-1.5 !text-sm" onClick={() => setCnForm(null)}>Cancel</button>
            </div>
          </div>
        )}
        {rec.irn && !rec.isCancelled && can('gst.cancel') && (
          <div className="flex w-full items-center gap-2 rounded-lg bg-red-50 p-2 dark:bg-red-900/10">
            <select className="input !py-1.5 max-w-[150px] text-sm" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
              <option value="">Cancel reason…</option>
              {(master?.einv_cancel_reason || []).map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
            </select>
            <button className="btn-danger !py-1.5 !text-sm" disabled={!cancelReason || !!busy} onClick={() => doCancel()}><Ban size={14} /> Cancel IRN</button>
          </div>
        )}
        {!rec.isArchived && can('gst.archive') && <button className="btn-ghost !text-sm" disabled={!!busy} onClick={() => act('Archive', () => api.post(`/gst/einvoices/${id}/archive`, { archived: true }))}><Archive size={14} /> Archive</button>}
        {rec.isArchived && can('gst.archive') && <button className="btn-ghost !text-sm" disabled={!!busy} onClick={() => act('Unarchive', () => api.post(`/gst/einvoices/${id}/archive`, { archived: false }))}><Archive size={14} /> Unarchive</button>}
        {editable && can('gst.edit') && <button className="btn-ghost !text-sm !text-red-600 hover:!bg-red-50 dark:hover:!bg-red-900/20" disabled={!!busy} onClick={doDelete}><Trash2 size={14} /> Delete</button>}
      </div>

      <Attachments objectType="einvoice" objectId={id} canUpload={can('gst.create')} canDelete={can('gst.edit')} />
      <DrawerSection title="Discussion"><Discussion objectType="einvoice" objectId={id} /></DrawerSection>
      <DrawerSection title="Version History"><VersionHistory objectType="einvoice" objectId={id} canRestore={can('gst.edit')} locked={!!rec.irn} restorePath={`/gst/einvoices/${id}/restore-version`} onRestored={refetch} /></DrawerSection>
      <Timeline timeline={rec.timeline} apiLogs={rec.apiLogs} />
      {otp && <OtpModal action="cancel_einvoice" objectType="einvoice" objectId={id} reason={`Cancel ${rec.docNo} (reason ${cancelReason})`} onVerified={(token) => { setOtp(false); doCancel(token); }} onClose={() => setOtp(false)} />}
    </Modal>
  );
}

/* ════════════════════════════ e-WAY BILL PANEL ═══════════════════════════ */
function EwbPanel({ can, master }) {
  const { branchQS } = useBranch();
  const [filters, setFilters] = useState({ search: '', status: '' });
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString() + (branchQS ? `&${branchQS}` : '');
  const { data: rows, loading, refetch } = useFetch(`/gst/ewbs?${qs}`, [qs]);
  const [form, setForm] = useState(null);
  const [detailId, setDetailId] = useState(null);

  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><Truck size={18} className="text-purple-600" /> E-Way Bills</h3>
        <div className="flex gap-2">
          <PortalUploadButton kind="ewb" compact />
          {can('gst.create') && <button className="btn-primary !py-1.5 !text-sm" onClick={() => setForm({})}><Plus size={15} /> New E-Way Bill</button>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !py-1.5 pl-8 text-sm" placeholder="EWB no, doc no, GSTIN, vehicle, transporter…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <select className="input !py-1.5 max-w-[150px] text-sm" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">Any status</option>
          {EWB_STATUSES.map((s) => <option key={s} value={s}>{ewbStatus(s)[1]}</option>)}
        </select>
      </div>
      <SavedViews objectType="ewb" filters={filters} onApply={(vf) => setFilters({ search: '', status: '', ...vf })} />
      {loading ? <Loading /> : (
        <Table
          columns={[{ header: 'EWB / Doc' }, { header: 'To / Vehicle' }, { header: 'Valid Upto' }, { header: 'Status' }]}
          rows={rows || []}
          empty="No e-way bills yet."
          onRowClick={(r) => setDetailId(r.id)}
          renderRow={(r) => {
            const [tone, label] = ewbStatus(r.status);
            return (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">{r.ewbNo || r.docNo || '—'}{r.branchCode && <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">{r.branchCode}</span>}<div className="text-xs font-normal text-slate-400">{dmy(r.docDate)}</div></td>
                <td className="td">{r.toTradeName || r.toGstin || '—'}<div className="font-mono text-xs text-slate-400">{r.vehicleNo || ''}</div></td>
                <td className="td text-xs">{r.validUpto ? dmyt(r.validUpto) : '—'}</td>
                <td className="td"><Badge tone={tone}>{label}</Badge></td>
              </>
            );
          }}
        />
      )}
      {form && <EwbForm master={master} onClose={() => setForm(null)} onSaved={() => { setForm(null); refetch(); }} />}
      {detailId && <EwbDetail id={detailId} can={can} master={master} onClose={() => setDetailId(null)} onChanged={refetch} />}
    </Card>
  );
}

function EwbForm({ master, onClose, onSaved }) {
  const toast = useToast();
  const { data: companyData } = useFetch('/company');
  const co = companyData || companyFallback;
  const [form, setForm] = useState({
    supplyType: 'O', subSupplyType: '1', docType: 'INV', docNo: '', docDate: todayISO(),
    transactionType: 1,
    fromGstin: co.gstin || '', fromTradeName: co.shortName || co.name || '', fromPlace: 'Madhubani', fromPincode: '847229', fromStateCode: String(co.gstin || '10').slice(0, 2),
    toGstin: '', toTradeName: '', toPlace: '', toPincode: '', toStateCode: '',
    totInvValue: '', totalTaxable: '', transDistance: '', transMode: '1', vehicleNo: '', vehicleType: 'R', transporterName: '', transporterId: '',
    items: [{ description: '', hsn: '', quantity: 1, unit: 'NOS', taxableAmount: 0, igstRate: 18 }],
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setItem = (i, k, v) => setForm((f) => { const n = structuredClone(f); n.items[i][k] = v; return n; });
  const opts = (cat) => (master?.[cat] || []);
  const isRoad = String(form.transMode) === '1';

  const save = async () => {
    setSaving(true);
    try {
      const taxable = form.items.reduce((s, it) => s + Number(it.taxableAmount || 0), 0);
      await api.post('/gst/ewbs', { ...form, totalTaxable: taxable, totInvValue: form.totInvValue || taxable });
      toast.success('E-Way Bill draft created'); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="New E-Way Bill" size="xl"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Save Draft'}</button></>}>
      <Section title="Part A — Supply & Document">
        <Field label="Supply Type"><select className="input" value={form.supplyType} onChange={set('supplyType')}>{opts('ewb_supply_type').map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</select></Field>
        <Field label="Sub-Supply Type"><select className="input" value={form.subSupplyType} onChange={set('subSupplyType')}>{opts('ewb_sub_supply_type').map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</select></Field>
        <Field label="Doc Type"><select className="input" value={form.docType} onChange={set('docType')}>{opts('ewb_doc_type').map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</select></Field>
        <Field label="Doc No"><input className="input" value={form.docNo} onChange={set('docNo')} /></Field>
        <Field label="Doc Date"><input className="input" type="date" value={form.docDate} onChange={set('docDate')} /></Field>
        <Field label="Transaction Type"><select className="input" value={form.transactionType} onChange={set('transactionType')}>{opts('ewb_txn_type').map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</select></Field>
      </Section>
      <Section title="From (Dispatch)">
        <Field label="GSTIN"><input className="input" value={form.fromGstin} onChange={set('fromGstin')} /></Field>
        <Field label="Trade Name"><input className="input" value={form.fromTradeName} onChange={set('fromTradeName')} /></Field>
        <Field label="Place"><input className="input" value={form.fromPlace} onChange={set('fromPlace')} /></Field>
        <Field label="Pincode"><input className="input" value={form.fromPincode} onChange={set('fromPincode')} /></Field>
        <Field label="State Code"><input className="input" value={form.fromStateCode} onChange={set('fromStateCode')} /></Field>
      </Section>
      <Section title="To (Ship To)">
        <Field label="GSTIN"><input className="input" value={form.toGstin} onChange={set('toGstin')} /></Field>
        <Field label="Trade Name"><input className="input" value={form.toTradeName} onChange={set('toTradeName')} /></Field>
        <Field label="Place"><input className="input" value={form.toPlace} onChange={set('toPlace')} /></Field>
        <Field label="Pincode"><input className="input" value={form.toPincode} onChange={set('toPincode')} /></Field>
        <Field label="State Code"><input className="input" value={form.toStateCode} onChange={set('toStateCode')} /></Field>
      </Section>
      <Section title="Part B — Transport (optional now; can add later)">
        <Field label="Distance (km)"><input className="input" type="number" value={form.transDistance} onChange={set('transDistance')} /></Field>
        <Field label="Mode"><select className="input" value={form.transMode} onChange={set('transMode')}>{opts('trans_mode').map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</select></Field>
        {isRoad ? <>
          <Field label="Vehicle No"><input className="input" value={form.vehicleNo} onChange={set('vehicleNo')} placeholder="MH12AB1234" /></Field>
          <Field label="Vehicle Type"><select className="input" value={form.vehicleType} onChange={set('vehicleType')}>{opts('vehicle_type').map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</select></Field>
        </> : <>
          <Field label="Transport Doc No"><input className="input" value={form.transDocNo || ''} onChange={set('transDocNo')} /></Field>
          <Field label="Transport Doc Date"><input className="input" type="date" value={form.transDocDate || ''} onChange={set('transDocDate')} /></Field>
        </>}
        <Field label="Transporter Name"><input className="input" value={form.transporterName} onChange={set('transporterName')} /></Field>
      </Section>
      <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-700 dark:text-slate-200">Items</h4>
      <div className="space-y-2">
        {form.items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <input className="input col-span-4 !py-1.5 text-sm" placeholder="Product" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
            <input className="input col-span-2 !py-1.5 text-sm" placeholder="HSN" value={it.hsn} onChange={(e) => setItem(i, 'hsn', e.target.value)} />
            <input className="input col-span-2 !py-1.5 text-sm" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
            <input className="input col-span-3 !py-1.5 text-sm" type="number" placeholder="Taxable" value={it.taxableAmount} onChange={(e) => setItem(i, 'taxableAmount', e.target.value)} />
            <button className="col-span-1 text-red-500" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}><Trash2 size={15} /></button>
          </div>
        ))}
        <button className="btn-ghost !py-1.5 !text-sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { description: '', hsn: '', quantity: 1, unit: 'NOS', taxableAmount: 0, igstRate: 18 }] }))}><Plus size={14} /> Add item</button>
      </div>
    </Modal>
  );
}

function EwbDetail({ id, can, master, onClose, onChanged }) {
  const toast = useToast();
  const { data: rec, loading, refetch } = useFetch(`/gst/ewbs/${id}`, [id]);
  const [busy, setBusy] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [otp, setOtp] = useState(false);
  const act = async (label, fn) => { setBusy(label); try { await fn(); toast.success(`${label} done`); refetch(); onChanged?.(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); } };
  const doCancel = async (otpToken) => {
    setBusy('Cancel');
    try { await api.post(`/gst/ewbs/${id}/cancel`, { reasonCode: cancelReason, remark: 'Cancelled via workspace', otpToken }); toast.success('EWB cancelled'); setOtp(false); refetch(); onChanged?.(); }
    catch (e) { if (e?.response?.status === 428) setOtp(true); else toast.error(apiError(e)); } finally { setBusy(''); }
  };
  if (loading || !rec) return <Modal open onClose={onClose} title="e-Way Bill"><Loading /></Modal>;
  const [tone, label] = ewbStatus(rec.status);
  const errs = (rec.validationErrors || []).filter((i) => i.severity === 'error');

  return (
    <Modal open onClose={onClose} title={`e-Way Bill ${rec.ewbNo || rec.docNo || ''}`} size="lg" footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
        <div>
          {rec.ewbNo ? <><p className="text-xs uppercase text-slate-400">EWB Number</p><p className="text-xl font-bold text-slate-900 dark:text-white">{rec.ewbNo}</p></> : <p className="text-sm text-slate-500">Not generated yet</p>}
          {rec.validUpto && <p className="mt-1 text-xs text-slate-500">Valid upto {dmyt(rec.validUpto)}</p>}
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>

      {errs.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/10">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-700"><AlertTriangle size={14} /> {errs.length} validation error(s)</p>
          <ul className="space-y-0.5 text-xs text-red-600">{errs.slice(0, 8).map((e, i) => <li key={i}>• {e.message}</li>)}</ul>
        </div>
      )}

      <DescList>
        <DescRow label="From">{rec.fromTradeName}<div className="font-mono text-xs text-slate-400">{rec.fromGstin}</div></DescRow>
        <DescRow label="To">{rec.toTradeName}<div className="font-mono text-xs text-slate-400">{rec.toGstin}</div></DescRow>
        <DescRow label="Doc">{rec.docType} {rec.docNo} ({dmy(rec.docDate)})</DescRow>
        <DescRow label="Distance">{rec.transDistance} km</DescRow>
        <DescRow label="Transport">{({ 1: 'Road', 2: 'Rail', 3: 'Air', 4: 'Ship' })[rec.transMode] || '—'} {rec.vehicleNo ? `• ${rec.vehicleNo}` : ''}</DescRow>
        <DescRow label="Part B">{rec.partBReady ? 'Complete' : 'Pending'}</DescRow>
        {rec.sourceEinvoiceId && <DescRow label="Linked"><span className="inline-flex items-center gap-1 text-brand-600"><Link2 size={12} /> from e-invoice</span></DescRow>}
      </DescList>

      <div className="mt-5 flex flex-wrap gap-2">
        {can('gst.validate') && !rec.ewbNo && <button className="btn-ghost !text-sm" disabled={!!busy} onClick={() => act('Validate', () => api.post(`/gst/ewbs/${id}/validate`))}><CheckCircle2 size={14} /> Validate</button>}
        {!rec.ewbNo && can('gst.submit') && <button className="btn-primary !text-sm" disabled={!!busy} onClick={() => act('Generate', () => api.post(`/gst/ewbs/${id}/generate`))}>{busy === 'Generate' ? <Loader2 className="animate-spin" size={14} /> : <Truck size={14} />} Generate EWB</button>}
        {rec.ewbNo && !rec.partBReady && can('gst.submit') && <button className="btn-ghost !text-sm" disabled={!!busy} onClick={() => act('Part B', () => api.post(`/gst/ewbs/${id}/update-partb`, { transMode: rec.transMode || '1', vehicleNo: rec.vehicleNo, vehicleType: rec.vehicleType || 'R' }))}>Update Part B</button>}
        {rec.ewbNo && !rec.isCancelled && can('gst.submit') && <button className="btn-ghost !text-sm" disabled={!!busy} onClick={() => act('Extend', () => api.post(`/gst/ewbs/${id}/extend`, {}))}><RefreshCw size={14} /> Extend</button>}
        {rec.ewbNo && can('gst.download') && <button className="btn-ghost !text-sm" onClick={() => gstDownload(`/gst/ewbs/${id}/pdf`)}><Download size={14} /> PDF</button>}
        {rec.ewbNo && !rec.isCancelled && !rec.isClosed && can('gst.submit') && <button className="btn-ghost !text-sm" disabled={!!busy} onClick={() => act('Close', () => api.post(`/gst/ewbs/${id}/close`))}>Close</button>}
        {rec.ewbNo && !rec.isCancelled && can('gst.cancel') && (
          <div className="flex w-full items-center gap-2 rounded-lg bg-red-50 p-2 dark:bg-red-900/10">
            <select className="input !py-1.5 max-w-[150px] text-sm" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
              <option value="">Cancel reason…</option>
              {(master?.ewb_cancel_reason || []).map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
            </select>
            <button className="btn-danger !py-1.5 !text-sm" disabled={!cancelReason || !!busy} onClick={() => doCancel()}><Ban size={14} /> Cancel EWB</button>
          </div>
        )}
      </div>

      <Attachments objectType="ewb" objectId={id} canUpload={can('gst.create')} canDelete={can('gst.edit')} />
      <DrawerSection title="Discussion"><Discussion objectType="ewb" objectId={id} /></DrawerSection>
      <DrawerSection title="Version History"><VersionHistory objectType="ewb" objectId={id} canRestore={can('gst.edit')} locked={!!rec.ewbNo} restorePath={`/gst/ewbs/${id}/restore-version`} onRestored={refetch} /></DrawerSection>
      <Timeline timeline={rec.timeline} apiLogs={rec.apiLogs} />
      {otp && <OtpModal action="cancel_ewb" objectType="ewb" objectId={id} reason={`Cancel EWB ${rec.ewbNo} (reason ${cancelReason})`} onVerified={(token) => { setOtp(false); doCancel(token); }} onClose={() => setOtp(false)} />}
    </Modal>
  );
}

/* ════════════════════════════ shared bits ════════════════════════════════ */
function Section({ title, children }) {
  return (
    <>
      <h4 className="mb-2 mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </>
  );
}

function Timeline({ timeline = [], apiLogs = [] }) {
  if (!timeline.length && !apiLogs.length) return null;
  return (
    <div className="mt-6">
      <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Audit Timeline</h4>
      <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
        {timeline.map((t) => (
          <li key={t.id} className="relative">
            <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.event_type?.replace(/_/g, ' ')}</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">{t.message}</p>
            <p className="text-xs text-slate-400">{dmyt(t.created_at)} {t.user_name ? `• ${t.user_name}` : ''}</p>
          </li>
        ))}
      </ol>
      {apiLogs.length > 0 && (
        <details className="mt-3 text-xs text-slate-400">
          <summary className="cursor-pointer font-medium">API log ({apiLogs.length})</summary>
          <ul className="mt-1 space-y-1">
            {apiLogs.map((l) => <li key={l.id}>{dmyt(l.created_at)} — <b>{l.action}</b> → {l.response_status} {l.error_code ? `(${l.error_code})` : ''}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
