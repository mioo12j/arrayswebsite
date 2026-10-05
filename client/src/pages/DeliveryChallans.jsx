import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Truck, Plus, Search, FileDown, Trash2, Loader2, X,
  PackageCheck, Undo2, FileText, Building2,
} from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader, Card, Loading, Table, Badge, EmptyState } from '../components/ui/index.jsx';
import Modal from '../components/ui/Modal.jsx';
import { gstDownload, inr, dmy } from '../lib/gst.js';
import { todayISO } from '../lib/format.js';
import { company } from '../config/company.js';
import { useUnsavedGuard, useDraft, loadDraft, clearDraft } from '../context/UnsavedChangesContext.jsx';

const STATUS_TONE = {
  draft: 'slate', pending_approval: 'amber', approved: 'blue', rejected: 'red',
  dispatched: 'violet', in_transit: 'violet', delivered: 'green', partially_delivered: 'amber',
  returned: 'amber', cancelled: 'red', converted: 'green', closed: 'slate',
};
const label = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const stateFromGstin = (g) => (g && g.length >= 2 ? g.slice(0, 2) : '');
const blankItem = () => ({ productName: '', hsn: '', quantity: 1, unit: 'NOS', rate: 0, gstRate: 18, batchNo: '', serialNo: '' });

export default function DeliveryChallans() {
  const toast = useToast();
  const { data: perms } = useFetch('/gst/me/permissions');
  const can = (p) => !!perms?.permissions?.includes(p);
  const { data: masters } = useFetch('/gst/challans/masters');
  const [filters, setFilters] = useState({ search: '', status: '', challanType: '', from: '', to: '' });
  const qs = useMemo(() => new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString(), [filters]);
  const { data: rows, loading, refetch } = useFetch(`/gst/challans?${qs}`, [qs]);
  const { data: stats, refetch: refetchStats } = useFetch('/gst/challans/stats');
  const [editing, setEditing] = useState(null);   // form object or null
  const [viewId, setViewId] = useState(null);

  const refreshAll = () => { refetch(); refetchStats(); };

  return (
    <div>
      <PageHeader
        title="Delivery Challans"
        subtitle="Rule 55 movement of goods without a tax invoice — job work, transfers, repair, approval basis & more."
        actions={can('gst.create') && <button className="btn-primary" onClick={() => setEditing({ items: [blankItem()] })}><Plus size={16} /> New Challan</button>}
      />

      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Active" value={stats.active} />
          <Stat label="Today's Dispatches" value={stats.today} />
          <Stat label="Pending Approval" value={stats.pendingApproval} tone={stats.pendingApproval ? 'text-amber-600' : ''} />
          <Stat label="Pending Delivery" value={stats.pendingDelivery} />
          <Stat label="Returns" value={stats.pendingReturns} />
          <Stat label="Converted" value={stats.byStatus?.converted || 0} />
        </div>
      )}

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Challan #, consignee, GSTIN, vehicle, EWB…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>
          <select className="input !w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_TONE).map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <select className="input !w-auto" value={filters.challanType} onChange={(e) => setFilters((f) => ({ ...f, challanType: e.target.value }))}>
            <option value="">All types</option>
            {(masters?.types || []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
          <input type="date" className="input !w-auto" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          <input type="date" className="input !w-auto" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          {can('gst.export') && (
            <button className="btn-ghost" onClick={() => gstDownload(`/gst/challans/export?format=xlsx&${qs}`, 'challan-register.xlsx')}><FileDown size={15} /> Register</button>
          )}
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : !rows?.length ? <EmptyState title="No delivery challans yet" hint='Click "New Challan" to create one.' /> : (
          <Table
            columns={[{ header: 'Challan #' }, { header: 'Date' }, { header: 'Type' }, { header: 'Consignee' }, { header: 'To State' }, { header: 'Value' }, { header: 'Status' }, { header: '' }]}
            rows={rows} empty="No delivery challans"
            renderRow={(c) => (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">{c.challanNo}</td>
                <td className="td text-sm">{dmy(c.challanDate)}</td>
                <td className="td text-sm">{c.challanTypeName || label(c.challanType)}</td>
                <td className="td text-sm">{c.consignee?.legalName || c.consignee?.tradeName || '—'}<div className="text-xs text-slate-400">{c.consignee?.gstin || 'Unregistered'}</div></td>
                <td className="td text-sm">{c.isInterstate ? <Badge tone="violet">Inter-state</Badge> : <Badge tone="slate">Intra</Badge>}</td>
                <td className="td text-sm font-medium">{inr(c.totalValue)}</td>
                <td className="td"><Badge tone={STATUS_TONE[c.status] || 'slate'}>{label(c.status)}</Badge></td>
                <td className="td text-right"><button className="btn-ghost !py-1 !text-xs" onClick={() => setViewId(c.id)}>Open</button></td>
              </>
            )}
          />
        )}
      </Card>

      {editing && <ChallanForm initial={editing} masters={masters} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refreshAll(); }} />}
      {viewId && <ChallanDetail id={viewId} can={can} onClose={() => setViewId(null)} onChanged={refreshAll} onEdit={(c) => { setViewId(null); setEditing(c); }} />}
    </div>
  );
}

function Stat({ label: l, value, tone = 'text-slate-800' }) {
  return (
    <Card className="!p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{l}</p>
      <p className={`mt-0.5 text-2xl font-bold ${tone} dark:text-white`}>{value ?? 0}</p>
    </Card>
  );
}

// ── Create / Edit form ───────────────────────────────────────────────────────
function ChallanForm({ initial, masters, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!initial.id;
  const { data: branches } = useFetch('/gst/branches');
  const defaultConsignor = { legalName: company.pdfName, gstin: company.gstin, addr1: company.address, location: 'Madhubani', pincode: '847229', stateCode: stateFromGstin(company.gstin) };
  const [f, setF] = useState(() => ({
    branchId: initial.branchId || '',
    challanType: initial.challanType || 'job_work',
    dispatchReason: initial.dispatchReason || '',
    challanDate: initial.challanDate ? String(initial.challanDate).slice(0, 10) : todayISO(),
    consigneeKind: initial.consigneeKind || 'registered',
    consignor: initial.consignor || defaultConsignor,
    consignee: initial.consignee || { legalName: '', gstin: '', addr1: '', location: '', pincode: '', stateCode: '' },
    transport: initial.transport || { mode: 'road', vehicleNo: '', transporterName: '', transporterId: '', lrNo: '', lrDate: '', driverName: '', driverMobile: '' },
    remarks: initial.remarks || '',
    items: (initial.items?.length ? initial.items : [blankItem()]).map((it) => ({ ...blankItem(), ...it })),
  }));
  const [busy, setBusy] = useState(false);
  // §6/§13 — unsaved-changes guard + crash-safe draft auto-save
  const draftKey = `challan-${initial.id || 'new'}`;
  const baselineRef = useRef(JSON.stringify(f));
  const dirty = JSON.stringify(f) !== baselineRef.current;
  useUnsavedGuard(dirty);
  useDraft(draftKey, f, dirty);
  useEffect(() => {
    if (initial.id) return;
    const d = loadDraft(draftKey);
    if (d && window.confirm('Restore your unsaved challan draft from earlier?')) setF(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => { if (dirty && !window.confirm('Discard unsaved changes? Your draft is saved and can be restored later.')) return; onClose(); };

  const setParty = (which, key) => (e) => setF((x) => ({ ...x, [which]: { ...x[which], [key]: e.target.value } }));
  const setTransport = (key) => (e) => setF((x) => ({ ...x, transport: { ...x.transport, [key]: e.target.value } }));
  const setItem = (i, key, val) => setF((x) => ({ ...x, items: x.items.map((it, k) => (k === i ? { ...it, [key]: val } : it)) }));
  const addItem = () => setF((x) => ({ ...x, items: [...x.items, blankItem()] }));
  const delItem = (i) => setF((x) => ({ ...x, items: x.items.filter((_, k) => k !== i) }));

  // auto-fill consignee state from its GSTIN
  const onConsigneeGstin = (e) => { const g = e.target.value.toUpperCase(); setF((x) => ({ ...x, consignee: { ...x.consignee, gstin: g, stateCode: stateFromGstin(g) || x.consignee.stateCode } })); };

  // auto-fill consignor from selected branch
  const onBranch = (e) => {
    const id = e.target.value;
    const b = branches?.find((x) => x.id === id);
    if (!b) { setF((x) => ({ ...x, branchId: id })); return; }
    setF((x) => ({
      ...x,
      branchId: id,
      consignor: {
        legalName: b.legal_name || b.trade_name || x.consignor.legalName,
        gstin: b.gstin || x.consignor.gstin,
        addr1: b.addr1 || x.consignor.addr1,
        location: b.place || x.consignor.location,
        pincode: b.pincode || x.consignor.pincode,
        stateCode: b.state_code || x.consignor.stateCode,
        phone: b.phone || x.consignor.phone,
        email: b.email || x.consignor.email,
      },
    }));
  };

  const liveTotals = useMemo(() => {
    const inter = f.consignor.stateCode && f.consignee.stateCode && f.consignor.stateCode !== f.consignee.stateCode;
    let taxable = 0, tax = 0;
    f.items.forEach((it) => { const base = Number(it.quantity || 0) * Number(it.rate || 0); taxable += base; tax += base * Number(it.gstRate || 0) / 100; });
    return { inter, taxable, tax, total: taxable + tax };
  }, [f.items, f.consignor.stateCode, f.consignee.stateCode]);

  const save = async () => {
    if (!f.consignee.legalName) return toast.error('Consignee name is required.');
    if (!f.items.some((it) => it.productName && Number(it.quantity) > 0)) return toast.error('Add at least one item with a name and quantity.');
    setBusy(true);
    try {
      const body = { ...f };
      if (isEdit) await api.patch(`/gst/challans/${initial.id}`, body);
      else await api.post('/gst/challans', body);
      clearDraft(draftKey);
      toast.success(isEdit ? 'Challan updated' : 'Delivery challan created');
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={close} size="xl" title={isEdit ? 'Edit Delivery Challan' : 'New Delivery Challan'}
      footer={<><button className="btn-ghost" onClick={close}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Truck size={16} />} {isEdit ? 'Save' : 'Create Challan'}</button></>}>
      <div className="space-y-5">
        {/* Office & GST selector */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Office &amp; Billing GST</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <L label="Select Office">
              <select className="input" value={f.branchId} onChange={onBranch}>
                <option value="">— Select Office —</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} — {b.gstin}</option>
                ))}
              </select>
            </L>
            <L label="Billing GSTIN">
              <input className="input bg-slate-50 dark:bg-slate-800/60 cursor-default" readOnly value={branches?.find((b) => b.id === f.branchId)?.gstin || ''} placeholder="Auto-filled when office is selected" />
            </L>
          </div>
          <p className="mt-1 text-xs text-slate-400">Selecting an office auto-fills the Consignor (From) block and sets the billing GST for this challan.</p>
        </div>

        {/* header */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <L label="Challan Type"><select className="input" value={f.challanType} onChange={(e) => setF((x) => ({ ...x, challanType: e.target.value }))}>{(masters?.types || []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></L>
          <L label="Reason"><select className="input" value={f.dispatchReason} onChange={(e) => setF((x) => ({ ...x, dispatchReason: e.target.value }))}><option value="">—</option>{(masters?.reasons || []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></L>
          <L label="Challan Date"><input type="date" className="input" value={f.challanDate} onChange={(e) => setF((x) => ({ ...x, challanDate: e.target.value }))} /></L>
          <L label="Consignee Type"><select className="input" value={f.consigneeKind} onChange={(e) => setF((x) => ({ ...x, consigneeKind: e.target.value }))}><option value="registered">Registered</option><option value="unregistered">Unregistered</option><option value="branch">Internal Branch</option><option value="warehouse">Warehouse</option><option value="jobworker">Job Worker</option></select></L>
        </div>

        {/* parties */}
        <div className="grid gap-4 md:grid-cols-2">
          <PartyCard title="Consignor (From)" p={f.consignor} set={(k) => setParty('consignor', k)} />
          <PartyCard title="Consignee (To)" p={f.consignee} set={(k) => setParty('consignee', k)} onGstin={onConsigneeGstin} />
        </div>

        {/* items */}
        <div>
          <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Goods</h4><button className="btn-ghost !py-1 !text-xs" onClick={addItem}><Plus size={13} /> Add item</button></div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500"><tr>
                <th className="px-2 py-1.5 text-left">Product</th><th className="px-2 py-1.5 text-left">HSN</th><th className="px-2 py-1.5 text-left">Batch/Serial</th>
                <th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-left">Unit</th><th className="px-2 py-1.5 text-right">Rate</th><th className="px-2 py-1.5 text-right">GST%</th><th className="px-2 py-1.5 text-right">Taxable</th><th></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {f.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-1 py-1"><input className="input !py-1 !text-sm min-w-[150px]" value={it.productName} onChange={(e) => setItem(i, 'productName', e.target.value)} placeholder="Description of goods" /></td>
                    <td className="px-1 py-1"><input className="input !py-1 !text-sm w-20" value={it.hsn} onChange={(e) => setItem(i, 'hsn', e.target.value)} /></td>
                    <td className="px-1 py-1"><input className="input !py-1 !text-sm w-24" value={it.batchNo} onChange={(e) => setItem(i, 'batchNo', e.target.value)} placeholder="batch" /></td>
                    <td className="px-1 py-1"><input type="number" className="input !py-1 !text-sm w-16 text-right" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} /></td>
                    <td className="px-1 py-1"><input className="input !py-1 !text-sm w-16" value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} /></td>
                    <td className="px-1 py-1"><input type="number" className="input !py-1 !text-sm w-24 text-right" value={it.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} /></td>
                    <td className="px-1 py-1"><input type="number" className="input !py-1 !text-sm w-14 text-right" value={it.gstRate} onChange={(e) => setItem(i, 'gstRate', e.target.value)} /></td>
                    <td className="px-2 py-1 text-right text-slate-500">{inr(Number(it.quantity || 0) * Number(it.rate || 0))}</td>
                    <td className="px-1 py-1">{f.items.length > 1 && <button className="text-slate-400 hover:text-red-500" onClick={() => delItem(i)}><Trash2 size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex justify-end gap-6 text-sm">
            <span className="text-slate-500">Taxable: <b className="text-slate-800 dark:text-slate-100">{inr(liveTotals.taxable)}</b></span>
            <span className="text-slate-500">{liveTotals.inter ? 'IGST' : 'CGST+SGST'}: <b className="text-slate-800 dark:text-slate-100">{inr(liveTotals.tax)}</b></span>
            <span className="text-slate-500">Total: <b className="text-brand-700 dark:text-brand-300">{inr(liveTotals.total)}</b></span>
          </div>
        </div>

        {/* transport */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Transport</h4>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <L label="Mode"><select className="input" value={f.transport.mode} onChange={setTransport('mode')}><option value="road">Road</option><option value="rail">Rail</option><option value="air">Air</option><option value="ship">Ship</option></select></L>
            <L label="Vehicle No"><input className="input" value={f.transport.vehicleNo} onChange={setTransport('vehicleNo')} placeholder="UP16AB1234" /></L>
            <L label="Transporter"><input className="input" value={f.transport.transporterName} onChange={setTransport('transporterName')} /></L>
            <L label="Transporter ID"><input className="input" value={f.transport.transporterId} onChange={setTransport('transporterId')} /></L>
            <L label="LR / Doc No"><input className="input" value={f.transport.lrNo} onChange={setTransport('lrNo')} /></L>
            <L label="LR Date"><input type="date" className="input" value={f.transport.lrDate} onChange={setTransport('lrDate')} /></L>
            <L label="Driver Name"><input className="input" value={f.transport.driverName} onChange={setTransport('driverName')} /></L>
            <L label="Driver Mobile"><input className="input" value={f.transport.driverMobile} onChange={setTransport('driverMobile')} /></L>
          </div>
        </div>

        <L label="Remarks"><input className="input" value={f.remarks} onChange={(e) => setF((x) => ({ ...x, remarks: e.target.value }))} /></L>
      </div>
    </Modal>
  );
}

function PartyCard({ title, p, set, onGstin }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-600"><Building2 size={13} /> {title}</p>
      <div className="space-y-2">
        <input className="input" placeholder="Legal / Trade name" value={p.legalName || ''} onChange={set('legalName')} />
        <input className="input" placeholder="GSTIN (blank if unregistered)" value={p.gstin || ''} onChange={onGstin || set('gstin')} />
        <input className="input" placeholder="Address" value={p.addr1 || ''} onChange={set('addr1')} />
        <div className="grid grid-cols-3 gap-2">
          <input className="input" placeholder="City" value={p.location || ''} onChange={set('location')} />
          <input className="input" placeholder="PIN" value={p.pincode || ''} onChange={set('pincode')} />
          <input className="input" placeholder="State code" value={p.stateCode || ''} onChange={set('stateCode')} />
        </div>
      </div>
    </div>
  );
}

const L = ({ label: l, children }) => (
  <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">{l}</span>{children}</label>
);

// ── Detail + lifecycle actions ───────────────────────────────────────────────
function ChallanDetail({ id, can, onClose, onChanged, onEdit }) {
  const toast = useToast();
  const { data: c, loading, refetch } = useFetch(`/gst/challans/${id}`);
  const [busy, setBusy] = useState('');

  const act = async (key, fn, confirm) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(key);
    try { await fn(); await refetch(); onChanged(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  const post = (path, body) => api.post(`/gst/challans/${id}/${path}`, body || {});

  if (loading || !c) return <Modal open onClose={onClose} title="Delivery Challan"><Loading /></Modal>;
  const s = c.status;
  const A = ({ k, icon: I, children, on, confirm, perm, tone = 'btn-ghost' }) => (!perm || can(perm)) && (
    <button className={`${tone} !text-sm`} disabled={busy === k} onClick={() => act(k, on, confirm)}>{busy === k ? <Loader2 className="animate-spin" size={14} /> : I && <I size={14} />} {children}</button>
  );

  return (
    <Modal open onClose={onClose} size="lg" title={`${c.challanNo} — ${label(c.challanType)}`}
      footer={
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {['draft', 'pending_approval', 'approved', 'rejected'].includes(s) && <A k="dispatch" icon={Truck} perm="gst.submit" tone="btn-primary" on={() => post('dispatch')} confirm="Dispatch goods? The challan becomes immutable after dispatch.">Dispatch</A>}
          {(s === 'dispatched' || s === 'in_transit' || s === 'partially_delivered') && <A k="deliver" icon={PackageCheck} perm="gst.edit" tone="btn-primary" on={() => post('deliver', { receiverName: window.prompt('Receiver name?') || '' })}>Mark Delivered</A>}
          {['dispatched', 'in_transit', 'delivered', 'partially_delivered'].includes(s) && <A k="return" icon={Undo2} perm="gst.edit" on={() => post('return', { reason: window.prompt('Return reason?') || '' })}>Record Return</A>}
          {['delivered', 'partially_delivered', 'returned'].includes(s) && !c.invoiceId && <A k="convert" icon={FileText} perm="gst.create" on={() => post('convert')}>Convert to Invoice</A>}
          {['draft', 'pending_approval', 'approved', 'rejected'].includes(s) && <A k="cancel" icon={X} perm="gst.cancel" on={() => post('cancel', { reason: window.prompt('Cancel reason?') || '' })} confirm="Cancel this challan?">Cancel</A>}
          {can('gst.edit') && ['draft', 'rejected'].includes(s) && <button className="btn-ghost !text-sm" onClick={() => onEdit(c)}>Edit</button>}
          <span className="flex-1" />
          {can('gst.download') && <button className="btn-ghost !text-sm" onClick={() => gstDownload(`/gst/challans/${id}/pdf`, `Challan_${c.challanNo}.pdf`)}><FileDown size={14} /> PDF</button>}
        </div>
      }>
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[s] || 'slate'}>{label(s)}</Badge>
          {c.isInterstate ? <Badge tone="violet">Inter-state</Badge> : <Badge tone="slate">Intra-state</Badge>}
          {c.invoiceId && <Badge tone="green">Converted to invoice</Badge>}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Info title="Consignor" p={c.consignor} />
          <Info title="Consignee" p={c.consignee} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500"><tr>
              <th className="px-2 py-1.5 text-left">#</th><th className="px-2 py-1.5 text-left">Product</th><th className="px-2 py-1.5 text-left">HSN</th><th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-right">Rate</th><th className="px-2 py-1.5 text-right">Taxable</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {c.items.map((it) => (<tr key={it.id}><td className="px-2 py-1.5">{it.lineNo}</td><td className="px-2 py-1.5">{it.productName}</td><td className="px-2 py-1.5">{it.hsn}</td><td className="px-2 py-1.5 text-right">{it.quantity} {it.unit}</td><td className="px-2 py-1.5 text-right">{inr(it.rate)}</td><td className="px-2 py-1.5 text-right">{inr(it.taxableValue)}</td></tr>))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-end gap-6">
          <span className="text-slate-500">Taxable <b className="text-slate-800 dark:text-slate-100">{inr(c.taxableValue)}</b></span>
          <span className="text-slate-500">CGST <b>{inr(c.cgstValue)}</b> · SGST <b>{inr(c.sgstValue)}</b> · IGST <b>{inr(c.igstValue)}</b></span>
          <span className="text-slate-500">Total <b className="text-brand-700 dark:text-brand-300">{inr(c.totalValue)}</b></span>
        </div>

        {(c.transport?.vehicleNo || c.transport?.transporterName) && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/40">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Transport: </span>
            {[c.transport.mode && label(c.transport.mode), c.transport.vehicleNo, c.transport.transporterName, c.transport.lrNo && `LR ${c.transport.lrNo}`].filter(Boolean).join('  •  ')}
          </div>
        )}

        {c.statusHistory?.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">History</p>
            <ol className="space-y-1 text-xs text-slate-500">
              {c.statusHistory.map((h) => (<li key={h.id}>{dmy(h.created_at)} — <b className="text-slate-700 dark:text-slate-200">{label(h.to_status)}</b>{h.note ? ` · ${h.note}` : ''}{h.user_name ? ` · ${h.user_name}` : ''}</li>))}
            </ol>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Info({ title, p = {} }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-600">{title}</p>
      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{p.legalName || p.tradeName || '—'}</p>
      <p className="text-xs text-slate-500">{p.gstin || 'Unregistered'}</p>
      <p className="text-xs text-slate-500">{[p.addr1, p.location, p.pincode].filter(Boolean).join(', ')}</p>
    </div>
  );
}
