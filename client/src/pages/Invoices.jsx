import { useMemo, useState, useRef, useEffect } from 'react';
import { Plus, Search, Loader2, FileDown, Upload, Trash2, FileText, Pencil, FileStack } from 'lucide-react';
import { api, apiError, download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Table, Badge, Field, EmptyState } from '../components/ui/index.jsx';
import { inr, fmtDate, todayISO } from '../lib/format.js';
import { useUnsavedGuard, useDraft, loadDraft, clearDraft } from '../context/UnsavedChangesContext.jsx';

const SELLER_STATE = '09'; // ARRAYS main office (Greater Noida, UP)
const STD_STATUS = ['draft', 'issued', 'cancelled'];
const label = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const blankItem = () => ({ description: '', hsn: '', quantity: 1, unit: 'NOS', rate: 0, gstRate: 18, orderQty: '', previousQty: 0 });

export default function Invoices() {
  const toast = useToast();
  const { canImport } = useAuth();
  const [filters, setFilters] = useState({ search: '', status: '' });
  const qs = useMemo(() => new URLSearchParams({ type: 'standard', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).toString(), [filters]);
  const { data: rows, loading, refetch } = useFetch(`/invoices/unified?${qs}`, [qs]);
  const { data: clients } = useFetch('/clients');
  const [editing, setEditing] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/invoices/extract', fd);
      setEditing({ invoice_number: data.extracted?.invoice_number || '', document_id: data.document_id, items: [blankItem()],
        taxable_amount: data.extracted?.taxable_amount, gst_amount: data.extracted?.gst_amount });
      toast.success('Invoice fields extracted — review & save');
    } catch (err) { toast.error(apiError(err)); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Standard commercial invoices and GST e-Invoices in one place, with e-Way Bill linkage."
        actions={<>
          <button className="btn-ghost" onClick={() => download('/reports/invoices?format=xlsx')}><FileDown size={16} /> Export</button>
          {canImport && (
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} Import
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*,application/pdf,.xlsx,.xls,.csv" className="hidden" onChange={onImport} />
          <button className="btn-primary" onClick={() => setEditing({ items: [blankItem()], status: 'issued' })}><Plus size={16} /> New Invoice</button>
        </>}
      />

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search invoice no, customer, GSTIN…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>
          <select className="input !w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : !rows?.length ? <EmptyState title="No invoices yet" hint='Click "New Invoice" to create a standard invoice, or generate a GST e-Invoice from the GST workspace.' /> : (
          <Table
            columns={[{ header: 'Invoice No' }, { header: 'Customer' }, { header: 'Date' }, { header: 'Amount', align: 'right' }, { header: 'Status' }, { header: 'Created By' }, { header: '' }]}
            rows={rows} empty="No invoices"
            renderRow={(r) => (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">
                  <button className="hover:underline" onClick={() => setPreviewId(r.id)} title="Open preview">{r.invoice_number || '—'}</button>
                </td>
                <td className="td text-sm">{r.party || '—'}<div className="text-xs text-slate-400">{r.gstin || ''}</div></td>
                <td className="td whitespace-nowrap text-sm">{fmtDate(r.date)}</td>
                <td className="td text-right font-medium">{inr(r.amount)}</td>
                <td className="td"><Badge status={r.status} /></td>
                <td className="td text-sm text-slate-500">{r.created_by_name || '—'}</td>
                <td className="td text-right">
                  <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setPreviewId(r.id)} title="Open preview"><FileText size={13} /> Preview</button>
                </td>
              </>
            )}
          />
        )}
      </Card>

      {previewId && (
        <InvoicePreview
          id={previewId}
          onClose={() => setPreviewId(null)}
          onEdit={() => { const id = previewId; setPreviewId(null); openInvoice(id, setEditing, toast); }}
          onDeleted={() => { setPreviewId(null); refetch(); toast.success('Invoice moved to Recovery Center'); }}
        />
      )}

      {editing && <InvoiceEditor initial={editing} clients={clients} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); toast.success('Invoice saved'); }} />}
    </div>
  );
}

function InvoicePreview({ id, onClose, onEdit, onDeleted }) {
  const toast = useToast();
  const { canWrite } = useAuth();
  const [inv, setInv] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true;
    api.get(`/invoices/${id}`).then(({ data }) => { if (on) setInv(data); }).catch((e) => toast.error(apiError(e)));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const del = async () => {
    if (!window.confirm('Delete this invoice? It will move to the Recovery Center and can be restored later.')) return;
    setBusy(true);
    try { await api.delete(`/invoices/${id}`); onDeleted(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const items = inv?.items || [];
  const inter = Number(inv?.igst_amount || 0) > 0;
  return (
    <Modal open onClose={onClose} size="xl" title={inv ? `Invoice ${inv.invoice_number || ''}` : 'Invoice'}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Close</button>
        {canWrite && <button className="btn-ghost !text-red-600" onClick={del} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} Delete</button>}
        {canWrite && <button className="btn-ghost" onClick={onEdit}><Pencil size={16} /> Edit</button>}
        <button className="btn-ghost" onClick={() => download(`/invoices/${id}/pdf?measurement=0`)}><FileDown size={16} /> Bill only</button>
        <button className="btn-primary" onClick={() => download(`/invoices/${id}/pdf`)}><FileStack size={16} /> Bill + Measurement</button>
      </>}>
      {!inv ? <Loading /> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
            <Detail label="Invoice No" value={inv.invoice_number} />
            <Detail label="Date" value={fmtDate(inv.issue_date)} />
            <Detail label="Type of Invoice" value={inv.supply_type || '—'} />
            <Detail label="Status" value={<Badge status={inv.status} />} />
            <Detail label="PO No" value={inv.po_no || '—'} />
            <Detail label="PO Date" value={inv.po_date ? fmtDate(inv.po_date) : '—'} />
            <Detail label="Place of Supply" value={inv.place_of_supply || '—'} />
            <Detail label="Measurement Sheet" value={inv.with_measurement !== false ? 'Yes' : 'No'} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Debited To</p>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{inv.customer_name || inv.client_name || '—'}</p>
              {inv.customer_gstin && <p className="text-slate-500">GSTIN: {inv.customer_gstin}</p>}
              {inv.billing_address && <p className="text-slate-500">{inv.billing_address}</p>}
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Site Address</p>
              <p className="whitespace-pre-line text-slate-600 dark:text-slate-300">{inv.site_address || inv.shipping_address || '—'}</p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50"><tr>
                <th className="px-2 py-1.5 text-left">HSN/SAC</th><th className="px-2 py-1.5 text-left">Description</th>
                {inv.with_measurement !== false && <th className="px-2 py-1.5 text-right">Prev</th>}
                <th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-left">Unit</th><th className="px-2 py-1.5 text-right">Rate</th><th className="px-2 py-1.5 text-right">Amount</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">{it.hsn || '—'}</td>
                    <td className="px-2 py-1.5">{it.description}</td>
                    {inv.with_measurement !== false && <td className="px-2 py-1.5 text-right">{Number(it.previous_qty) || 0}</td>}
                    <td className="px-2 py-1.5 text-right">{Number(it.quantity)}</td>
                    <td className="px-2 py-1.5">{it.unit}</td>
                    <td className="px-2 py-1.5 text-right">{inr(it.rate)}</td>
                    <td className="px-2 py-1.5 text-right">{inr(it.taxable_value || Number(it.quantity) * Number(it.rate))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-5">
            <span className="text-slate-500">Taxable <b className="text-slate-800 dark:text-slate-100">{inr(inv.taxable_amount)}</b></span>
            {inter ? <span className="text-slate-500">IGST <b>{inr(inv.igst_amount)}</b></span>
              : <span className="text-slate-500">CGST <b>{inr(inv.cgst_amount)}</b> · SGST <b>{inr(inv.sgst_amount)}</b></span>}
            <span className="text-slate-500">Grand Total <b className="text-brand-700 dark:text-brand-300">{inr(inv.total_amount)}</b></span>
          </div>
          {inv.notes && <p className="text-slate-500"><span className="font-semibold">Notes:</span> {inv.notes}</p>}
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

async function openInvoice(id, setEditing, toast) {
  try {
    const { data } = await api.get(`/invoices/${id}`);
    setEditing({
      id, invoice_number: data.invoice_number, status: data.status, issue_date: data.issue_date?.slice(0, 10) || '',
      due_date: data.due_date?.slice(0, 10) || '', client_id: data.client_id || '', customer_name: data.customer_name || '',
      customer_gstin: data.customer_gstin || '', place_of_supply: data.place_of_supply || '',
      billing_address: data.billing_address || '', shipping_address: data.shipping_address || '', notes: data.notes || '',
      supply_type: data.supply_type || '', po_no: data.po_no || '', po_date: data.po_date?.slice(0, 10) || '',
      site_address: data.site_address || '', with_measurement: data.with_measurement !== false,
      header_text: data.header_text || '', footer_text: data.footer_text || '',
      header_address: data.header_address || '', header_cin: data.header_cin || '', header_email: data.header_email || '',
      branch_id: data.branch_id || '',
      linked_ewb_no: data.linked_ewb_no, linked_ewb_status: data.linked_ewb_status,
      items: (data.items?.length ? data.items : [blankItem()]).map((it) => ({
        description: it.description || '', hsn: it.hsn || '', quantity: Number(it.quantity) || 1, unit: it.unit || 'NOS',
        rate: Number(it.rate) || 0, gstRate: Number(it.gst_rate) || 0,
        orderQty: it.order_qty != null ? Number(it.order_qty) : '', previousQty: Number(it.previous_qty) || 0,
      })),
    });
  } catch (e) { toast.error(apiError(e)); }
}

function InvoiceEditor({ initial, clients, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!initial.id;
  const { data: branches } = useFetch('/gst/branches');
  const [f, setF] = useState(() => ({
    invoice_number: initial.invoice_number || '', status: initial.status || 'issued',
    issue_date: initial.issue_date || todayISO(), due_date: initial.due_date || '',
    client_id: initial.client_id || '', customer_name: initial.customer_name || '', customer_gstin: initial.customer_gstin || '',
    place_of_supply: initial.place_of_supply || '', billing_address: initial.billing_address || '', shipping_address: initial.shipping_address || '',
    supply_type: initial.supply_type || '', po_no: initial.po_no || '', po_date: initial.po_date || '',
    site_address: initial.site_address || '', with_measurement: initial.with_measurement !== false,
    header_text: initial.header_text || '', footer_text: initial.footer_text || '',
    header_address: initial.header_address || '', header_cin: initial.header_cin || '', header_email: initial.header_email || '',
    branch_id: initial.branch_id || '',
    notes: initial.notes || '', document_id: initial.document_id || null,
    items: (initial.items?.length ? initial.items : [blankItem()]).map((it) => ({ ...blankItem(), ...it })),
  }));
  const [busy, setBusy] = useState(false);
  // §6/§13 — unsaved-changes guard + crash-safe draft auto-save
  const draftKey = `invoice-${initial.id || 'new'}`;
  const baselineRef = useRef(JSON.stringify(f));
  const dirty = JSON.stringify(f) !== baselineRef.current;
  useUnsavedGuard(dirty);
  useDraft(draftKey, f, dirty);
  useEffect(() => {
    if (initial.id) return;
    const d = loadDraft(draftKey);
    if (d && window.confirm('Restore your unsaved invoice draft from earlier?')) { setF(d); return; }
    // Pre-fill the next invoice number from the series so it's sequential and the
    // operator never has to hand-track it (still editable; server enforces it too).
    api.get('/gst/number-series/preview').then(({ data }) => {
      if (data?.next) setF((x) => (x.invoice_number ? x : { ...x, invoice_number: data.next }));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => { if (dirty && !window.confirm('Discard unsaved changes? Your draft is saved and can be restored later.')) return; onClose(); };
  const setItem = (i, k, v) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const addItem = () => setF((x) => ({ ...x, items: [...x.items, blankItem()] }));
  const delItem = (i) => setF((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }));
  const onClient = (e) => { const id = e.target.value; const c = clients?.find((x) => x.id === id); setF((x) => ({ ...x, client_id: id, customer_name: c?.name || x.customer_name, customer_gstin: c?.gstin || x.customer_gstin, place_of_supply: (c?.gstin || '').slice(0, 2) || x.place_of_supply })); };
  const onBranch = (e) => {
    const id = e.target.value;
    const b = branches?.find((x) => x.id === id);
    if (!b) { setF((x) => ({ ...x, branch_id: id })); return; }
    const addr = [b.addr1, b.addr2, b.place, b.pincode].filter(Boolean).join(', ');
    setF((x) => ({
      ...x,
      branch_id: id,
      header_text: b.legal_name || b.trade_name || x.header_text,
      header_address: addr || x.header_address,
      header_email: b.email || x.header_email,
    }));
  };

  const totals = useMemo(() => {
    const inter = f.place_of_supply && f.place_of_supply !== SELLER_STATE;
    let taxable = 0, tax = 0;
    f.items.forEach((it) => { const base = Number(it.quantity || 0) * Number(it.rate || 0); taxable += base; tax += base * Number(it.gstRate || 0) / 100; });
    return { inter, taxable, tax, cgst: inter ? 0 : tax / 2, sgst: inter ? 0 : tax / 2, igst: inter ? tax : 0, total: taxable + tax };
  }, [f.items, f.place_of_supply]);

  const save = async () => {
    // Number may be left blank — the server auto-allocates the next one in the series.
    if (!f.items.some((it) => it.description && Number(it.quantity) > 0)) return toast.error('Add at least one item');
    setBusy(true);
    try {
      const body = { ...f, client_id: f.client_id || null, issue_date: f.issue_date || null, due_date: f.due_date || null, po_date: f.po_date || null };
      if (isEdit) await api.patch(`/invoices/${initial.id}`, body); else await api.post('/invoices', body);
      clearDraft(draftKey);
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={close} size="xl" title={isEdit ? `Edit Invoice ${initial.invoice_number || ''}` : 'New Standard Invoice'}
      footer={<><button className="btn-ghost" onClick={close}>Cancel</button>
        {isEdit && <button className="btn-ghost" onClick={() => download(`/invoices/${initial.id}/pdf`)}><FileDown size={16} /> PDF</button>}
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />} {isEdit ? 'Save' : 'Create Invoice'}</button></>}>
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Office &amp; Billing GST</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Select Office">
              <select className="input" value={f.branch_id} onChange={onBranch}>
                <option value="">— Select Office —</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} — {b.gstin}</option>
                ))}
              </select>
            </Field>
            <Field label="Billing GSTIN">
              <input className="input bg-slate-50 dark:bg-slate-800/60 cursor-default" readOnly value={branches?.find((b) => b.id === f.branch_id)?.gstin || ''} placeholder="Auto-filled when office is selected" />
            </Field>
          </div>
          <p className="mt-1 text-xs text-slate-400">Selecting an office auto-fills the header name, address, and email below. The office GSTIN is used as the billing GST on the invoice.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Invoice Number" hint="Auto-filled from your series — leave blank to auto-number"><input className="input" value={f.invoice_number} onChange={(e) => setF((x) => ({ ...x, invoice_number: e.target.value }))} placeholder="Leave blank to auto-number" /></Field>
          <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}>{STD_STATUS.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
          <Field label="Invoice Date"><input type="date" className="input" value={f.issue_date} onChange={(e) => setF((x) => ({ ...x, issue_date: e.target.value }))} /></Field>
          <Field label="Due Date"><input type="date" className="input" value={f.due_date} onChange={(e) => setF((x) => ({ ...x, due_date: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Type of Invoice"><input className="input" value={f.supply_type} onChange={(e) => setF((x) => ({ ...x, supply_type: e.target.value }))} placeholder="Supply and Installation" /></Field>
          <Field label="PO No."><input className="input" value={f.po_no} onChange={(e) => setF((x) => ({ ...x, po_no: e.target.value }))} placeholder="Mar/004" /></Field>
          <Field label="PO Date"><input type="date" className="input" value={f.po_date} onChange={(e) => setF((x) => ({ ...x, po_date: e.target.value }))} /></Field>
          <Field label="Place of Supply (state code)"><input className="input" value={f.place_of_supply} onChange={(e) => setF((x) => ({ ...x, place_of_supply: e.target.value }))} placeholder="09" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Customer (existing)"><select className="input" value={f.client_id} onChange={onClient}><option value="">— free text —</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Debited To (Customer Name)"><input className="input" value={f.customer_name} onChange={(e) => setF((x) => ({ ...x, customer_name: e.target.value }))} /></Field>
          <Field label="Customer GSTIN"><input className="input" value={f.customer_gstin} onChange={(e) => setF((x) => ({ ...x, customer_gstin: e.target.value.toUpperCase(), place_of_supply: e.target.value.slice(0, 2) || x.place_of_supply }))} /></Field>
          <Field label="Billing Address (Debited To)"><input className="input" value={f.billing_address} onChange={(e) => setF((x) => ({ ...x, billing_address: e.target.value }))} /></Field>
        </div>
        <Field label="Site Address (works / dispatch — one line per site, e.g. Harmutty, Assam  400.02 KWp)">
          <textarea className="input min-h-[64px]" value={f.site_address} onChange={(e) => setF((x) => ({ ...x, site_address: e.target.value }))} placeholder={'Harmutty, Assam 400.02 KWp\nKoomber, Assam 630.46 KWp'} />
        </Field>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/30">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Letterhead — header &amp; footer (optional)</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Header name (top of PDF)"><input className="input" value={f.header_text} onChange={(e) => setF((x) => ({ ...x, header_text: e.target.value }))} placeholder="ARRAYS INGENIERIA PVT LTD" /></Field>
            <Field label="Footer slogan (bottom of PDF)"><input className="input" value={f.footer_text} onChange={(e) => setF((x) => ({ ...x, footer_text: e.target.value }))} placeholder="Developing Green Energy for Nation" /></Field>
            <Field label="Header address"><input className="input" value={f.header_address} onChange={(e) => setF((x) => ({ ...x, header_address: e.target.value }))} placeholder="Registered / branch address" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Header CIN"><input className="input" value={f.header_cin} onChange={(e) => setF((x) => ({ ...x, header_cin: e.target.value }))} placeholder="U45309DL2018PTC340544" /></Field>
              <Field label="Header email"><input className="input" value={f.header_email} onChange={(e) => setF((x) => ({ ...x, header_email: e.target.value }))} placeholder="arraysingenieria@gmail.com" /></Field>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">Leave any field blank to use the company defaults. These appear on the PDF header band and footer.</p>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Items {f.with_measurement && <span className="text-xs font-normal text-slate-400">· running-account (Order / Previous / Present qty)</span>}</h4>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={f.with_measurement} onChange={(e) => setF((x) => ({ ...x, with_measurement: e.target.checked }))} />
                Generate Measurement Sheet
              </label>
              <button className="btn-ghost !py-1 !text-xs" onClick={addItem}><Plus size={13} /> Add item</button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50"><tr>
                <th className="px-2 py-1.5 text-left">Description</th><th className="px-2 py-1.5 text-left">HSN/SAC</th>
                {f.with_measurement && <th className="px-2 py-1.5 text-right">Order Qty</th>}
                {f.with_measurement && <th className="px-2 py-1.5 text-right">Prev Qty</th>}
                <th className="px-2 py-1.5 text-right">{f.with_measurement ? 'Present Qty' : 'Qty'}</th><th className="px-2 py-1.5 text-left">Unit</th><th className="px-2 py-1.5 text-right">Rate</th><th className="px-2 py-1.5 text-right">GST%</th><th className="px-2 py-1.5 text-right">Taxable</th><th></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {f.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-1 py-1"><input className="input !py-1 !text-sm min-w-[160px]" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="Item / service" /></td>
                    <td className="px-1 py-1"><input className="input !py-1 !text-sm w-20" value={it.hsn} onChange={(e) => setItem(i, 'hsn', e.target.value)} /></td>
                    {f.with_measurement && <td className="px-1 py-1"><input type="number" className="input !py-1 !text-sm w-16 text-right" value={it.orderQty} onChange={(e) => setItem(i, 'orderQty', e.target.value)} placeholder="1" /></td>}
                    {f.with_measurement && <td className="px-1 py-1"><input type="number" className="input !py-1 !text-sm w-16 text-right" value={it.previousQty} onChange={(e) => setItem(i, 'previousQty', e.target.value)} /></td>}
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
          {f.with_measurement && <p className="mt-1 text-xs text-slate-400">Rate × Present Qty = this bill's taxable value. The Measurement Sheet (page 2 of the PDF) shows Previous + Present = Total cumulative billing. Leave Order Qty blank to default it to Previous + Present.</p>}
          <div className="mt-2 flex flex-wrap justify-end gap-5 text-sm">
            <span className="text-slate-500">Taxable <b className="text-slate-800 dark:text-slate-100">{inr(totals.taxable)}</b></span>
            {totals.inter
              ? <span className="text-slate-500">IGST <b>{inr(totals.igst)}</b></span>
              : <span className="text-slate-500">CGST <b>{inr(totals.cgst)}</b> · SGST <b>{inr(totals.sgst)}</b></span>}
            <span className="text-slate-500">Total <b className="text-brand-700 dark:text-brand-300">{inr(totals.total)}</b></span>
          </div>
        </div>

        <Field label="Notes"><textarea className="input min-h-[50px]" value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} /></Field>
      </div>
    </Modal>
  );
}
