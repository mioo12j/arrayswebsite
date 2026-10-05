import { useState, useRef } from 'react';
import { Plus, Search, Upload, Loader2, Sparkles, Paperclip, FileDown, Trash2 } from 'lucide-react';
import { api, apiError, download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Badge, Table, Field, DescList, DescRow } from '../components/ui/index.jsx';
import { inr, fmtDate, fmtDateTime, titleCase } from '../lib/format.js';
import { PRESETS, presetRange } from '../lib/dateRange.js';
import AllocationModal from '../components/AllocationModal.jsx';
import ProofView from '../components/ui/ProofView.jsx';
import { Layers, Pencil, Copy } from 'lucide-react';

const BLANK = {
  reference_id: '', amount: '', payment_date: '', beneficiary_name: '', account_details: '',
  bank_remarks: '', network_type: '', payment_mode: 'neft', comment: '',
  project_id: '', site_id: '', vendor_id: '', employee_id: '', payee_type: 'vendor',
  category_id: '', material_type: '', tags: '', txn_kind: 'expense',
};

export default function Payments() {
  const toast = useToast();
  const [filters, setFilters] = useState({ search: '', vendor_id: '', project_id: '', invoice_status: '', from: '', to: '' });
  const [preset, setPreset] = useState('');
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString();

  const applyPreset = (val) => {
    setPreset(val);
    if (val !== 'custom') { const r = presetRange(val); setFilters((f) => ({ ...f, from: r.from, to: r.to })); }
  };

  const { data: payments, loading, refetch } = useFetch(`/payments?${qs}`, [qs]);
  const { data: vendors } = useFetch('/vendors');
  const { data: employees } = useFetch('/employees');
  const { data: projects } = useFetch('/projects');
  const { data: sites } = useFetch('/sites');
  const { data: categories } = useFetch('/categories');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const fileRef = useRef(null);
  const attachId = useRef(null);

  const pickInvoice = (id) => { attachId.current = id; fileRef.current?.click(); };
  const onInvoiceFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !attachId.current) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/payments/${attachId.current}/invoice`, fd);
      toast.success('Invoice attached');
      refetch();
    } catch (err) { toast.error(apiError(err)); }
    finally { attachId.current = null; if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div>
      <PageHeader
        title="Outgoing Payments"
        subtitle="Upload a payment proof — the OCR engine extracts the details. Verify, classify, and add a mandatory note."
        actions={
          <>
            <button className="btn-ghost" onClick={() => download(`/reports/payments?format=xlsx&${qs}`)}><FileDown size={16} /> Excel</button>
            <button className="btn-ghost" onClick={() => download(`/reports/payments?format=pdf&${qs}`)}><FileDown size={16} /> PDF</button>
            <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New Payment</button>
          </>
        }
      />

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search reference, beneficiary, comment…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
          <select className="input max-w-[180px]" value={filters.vendor_id} onChange={(e) => setFilters((f) => ({ ...f, vendor_id: e.target.value }))}>
            <option value="">All vendors</option>
            {vendors?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select className="input max-w-[180px]" value={filters.project_id} onChange={(e) => setFilters((f) => ({ ...f, project_id: e.target.value }))}>
            <option value="">All projects</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input max-w-[160px]" value={filters.invoice_status} onChange={(e) => setFilters((f) => ({ ...f, invoice_status: e.target.value }))}>
            <option value="">Any invoice status</option>
            <option value="pending">Invoice Pending</option>
            <option value="attached">Invoice Attached</option>
          </select>
          <select className="input max-w-[200px]" value={preset} onChange={(e) => applyPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {preset === 'custom' && (
            <>
              <input className="input max-w-[150px]" type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} title="From" />
              <input className="input max-w-[150px]" type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} title="To" />
            </>
          )}
        </div>
        {(filters.from || filters.to) && (
          <p className="mt-2 px-1 text-xs text-slate-400">Exports & list filtered: {filters.from || '…'} → {filters.to || '…'}</p>
        )}
      </Card>

      <Card className="!p-0">
        {loading ? (
          <Loading />
        ) : (
          <Table
            columns={[
              { header: 'Date' }, { header: 'Reference' }, { header: 'Vendor / Beneficiary' },
              { header: 'Project' }, { header: 'Category' }, { header: 'Amount', align: 'right' },
              { header: 'Invoice' }, { header: 'Remark / Comment' }, { header: '' },
            ]}
            rows={payments || []}
            empty="No payments recorded yet. Click “New Payment” to upload your first proof."
            onRowClick={(p) => setDetail(p)}
            renderRow={(p) => (
              <>
                <td className="td whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                <td className="td font-mono text-xs">{p.reference_id || '—'}</td>
                <td className="td">
                  {p.vendor_name || p.employee_name || p.beneficiary_name || '—'}
                  {p.employee_name && <Badge tone="purple" className="ml-1">Employee</Badge>}
                </td>
                <td className="td">{p.project_name || '—'}{p.site_name ? ` · ${p.site_name}` : ''}</td>
                <td className="td">{p.category_name || '—'}</td>
                <td className="td text-right font-semibold text-red-600">{inr(p.amount)}</td>
                <td className="td"><Badge status={p.invoice_status} /></td>
                <td className="td max-w-[220px]">
                  {p.bank_remarks && <div className="truncate text-xs text-slate-400" title={p.bank_remarks}>📄 {p.bank_remarks}</div>}
                  <div className="truncate text-slate-600 dark:text-slate-300" title={p.comment}>{p.comment}</div>
                </td>
                <td className="td text-right">
                  {p.invoice_status === 'pending' && (
                    <button className="btn-ghost !py-1 !px-2.5 !text-xs" onClick={(e) => { e.stopPropagation(); pickInvoice(p.id); }}>
                      <Paperclip size={12} /> Attach
                    </button>
                  )}
                </td>
              </>
            )}
          />
        )}
      </Card>

      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onInvoiceFile} />

      {(open || editing) && (
        <PaymentModal
          initial={editing}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSaved={() => { setOpen(false); setEditing(null); refetch(); toast.success(editing ? 'Payment updated & ledger re-posted' : 'Payment saved & ledger updated'); }}
          vendors={vendors} employees={employees} projects={projects} sites={sites} categories={categories}
        />
      )}

      {detail && (
        <PaymentDetail
          payment={detail}
          onClose={() => setDetail(null)}
          onEdit={(p) => { setDetail(null); setEditing(p); }}
          onAttach={(id) => { setDetail(null); pickInvoice(id); }}
          onChanged={() => { setDetail(null); refetch(); }}
          onDeleted={() => { setDetail(null); refetch(); toast.success('Payment moved to Recovery Center'); }}
        />
      )}
    </div>
  );
}

// Read-only detail view for a single payment — every field that was recorded.
function PaymentDetail({ payment: p, onClose, onEdit, onAttach, onChanged, onDeleted }) {
  const toast = useToast();
  const { canWrite } = useAuth();
  const [busy, setBusy] = useState(false);
  const [alloc, setAlloc] = useState(false);
  const fromStatement = p.source === 'reconciliation' || !!p.recon_item_id;
  const isDuplicate = p.txn_kind === 'duplicate';
  const del = async () => {
    const warn = fromStatement
      ? 'This payment came from a bank statement — deleting it will make that statement no longer reconcile.\n\nUnless it was never really paid, prefer "Mark Duplicate" (keeps it linked to the statement but counts it nowhere).\n\nDelete anyway?'
      : 'Delete this payment? It will move to the Recovery Center (recoverable for 30 days) and its ledger entry is reversed.';
    if (!window.confirm(warn)) return;
    setBusy(true);
    try { await api.delete(`/payments/${p.id}`); onDeleted(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const markDuplicate = async () => {
    if (!window.confirm('Mark this as a DUPLICATE payment? It stays on record and linked to its bank statement, but is excluded from every total and its ledger entry is removed.')) return;
    setBusy(true);
    try { await api.patch(`/payments/${p.id}`, { txn_kind: 'duplicate' }); toast.success('Marked as duplicate — excluded from all totals'); onChanged?.(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const unmarkDuplicate = async () => {
    setBusy(true);
    try { await api.patch(`/payments/${p.id}`, { txn_kind: 'expense' }); toast.success('Restored as a normal expense'); onChanged?.(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Payment Details" size="lg"
      footer={<>
        {canWrite && <button className="btn-ghost !text-red-600" onClick={del} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} Delete</button>}
        {canWrite && !isDuplicate && <button className="btn-ghost !text-amber-600" onClick={markDuplicate} disabled={busy}><Copy size={16} /> Mark Duplicate</button>}
        {canWrite && isDuplicate && <button className="btn-ghost" onClick={unmarkDuplicate} disabled={busy}><Copy size={16} /> Unmark Duplicate</button>}
        {canWrite && onEdit && <button className="btn-ghost" onClick={() => onEdit(p)}><Pencil size={16} /> Edit</button>}
        {canWrite && <button className="btn-ghost" onClick={() => setAlloc(true)}><Layers size={16} /> Edit Allocation</button>}
        <button className="btn-ghost" onClick={onClose}>Close</button>
      </>}>
      {isDuplicate && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
          Marked DUPLICATE — kept for the statement record, excluded from all totals and ledgers.
        </div>
      )}
      <div className="mb-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Amount Paid</p>
          <p className="text-2xl font-bold text-red-600">{inr(p.amount)}</p>
        </div>
        <Badge status={p.invoice_status} />
      </div>

      <DescList>
        <DescRow label="Date">{fmtDate(p.payment_date)}</DescRow>
        <DescRow label="Reference / UTR" mono>{p.reference_id}</DescRow>
        <DescRow label="Paid To">
          {p.vendor_name || p.employee_name || p.beneficiary_name || '—'}
          {p.employee_name && <Badge tone="purple" className="ml-1">Employee</Badge>}
        </DescRow>
        <DescRow label="Beneficiary (on proof)">{p.beneficiary_name}</DescRow>
        <DescRow label="Account Details" mono>{p.account_details}</DescRow>
        <DescRow label="Payment Mode">{p.payment_mode ? p.payment_mode.toUpperCase() : null}</DescRow>
        <DescRow label="Network Type">{p.network_type}</DescRow>
        <DescRow label="Category">{p.category_name}</DescRow>
        <DescRow label="Project / Site">
          {p.project_name ? `${p.project_name}${p.site_name ? ` · ${p.site_name}` : ''}` : null}
        </DescRow>
        <DescRow label="Material Type">{p.material_type}</DescRow>
        <DescRow label="Tags">{p.tags?.length ? p.tags.join(', ') : null}</DescRow>
        <DescRow label="Recorded On">{fmtDateTime(p.created_at)}</DescRow>
        <DescRow label="Bank Remark (auto-extracted)" wide>{p.bank_remarks}</DescRow>
        <DescRow label="Comment (entered by operator)" wide>{p.comment}</DescRow>
      </DescList>

      {p.proof_document_id && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Payment Proof</p>
          <ProofView documentId={p.proof_document_id} name={p.proof_name || 'payment-proof'} label="Open payment proof" />
        </div>
      )}

      {p.invoice_status === 'pending' && onAttach && (
        <button className="btn-ghost mt-5" onClick={() => onAttach(p.id)}>
          <Paperclip size={14} /> Attach Invoice
        </button>
      )}
      {alloc && (
        <AllocationModal kind="outgoing" id={p.id} amount={p.amount}
          meta={{ reference: p.reference_id, date: fmtDate(p.payment_date), party: p.vendor_name || p.employee_name || p.beneficiary_name }}
          onClose={() => setAlloc(false)} onSaved={() => setAlloc(false)} />
      )}
    </Modal>
  );
}

function PaymentModal({ initial, onClose, onSaved, vendors, employees, projects, sites, categories }) {
  const toast = useToast();
  const { canImport } = useAuth();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(() => (initial ? {
    ...BLANK,
    reference_id: initial.reference_id || '', amount: initial.amount ?? '',
    payment_date: initial.payment_date ? String(initial.payment_date).slice(0, 10) : '',
    beneficiary_name: initial.beneficiary_name || '', account_details: initial.account_details || '',
    bank_remarks: initial.bank_remarks || '', comment: initial.comment || '',
    payment_mode: initial.payment_mode || 'neft', network_type: initial.network_type || '',
    project_id: initial.project_id || '', site_id: initial.site_id || '',
    vendor_id: initial.vendor_id || '', employee_id: initial.employee_id || '',
    payee_type: initial.employee_id ? 'employee' : 'vendor',
    category_id: initial.category_id || '', material_type: initial.material_type || '',
    tags: Array.isArray(initial.tags) ? initial.tags.join(', ') : (initial.tags || ''),
    txn_kind: initial.txn_kind || 'expense',
  } : BLANK));
  const [documentId, setDocumentId] = useState(initial?.proof_document_id || null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrPreview, setOcrPreview] = useState('');
  const [warn, setWarn] = useState(null);     // { status, duplicate, own }
  const [override, setOverride] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const siteOptions = sites?.filter((s) => !form.project_id || s.project_id === form.project_id) || [];

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/payments/extract', fd);
      setDocumentId(data.document_id);
      setOcrPreview(data.ocr_preview || '');
      const ex = data.extracted || {};
      setForm((f) => ({
        ...f,
        reference_id: ex.reference_id || f.reference_id,
        amount: ex.amount ?? f.amount,
        payment_date: ex.payment_date || f.payment_date,
        beneficiary_name: ex.beneficiary_name || f.beneficiary_name,
        account_details: ex.account_details || f.account_details,
        bank_remarks: ex.bank_remarks || f.bank_remarks,
        network_type: ex.network_type || f.network_type,
        payment_mode: ex.payment_mode || f.payment_mode,
        vendor_id: data.suggested_vendor?.vendor_id || f.vendor_id,
        txn_kind: data.own_transfer ? 'internal_transfer' : f.txn_kind,
      }));
      setWarn({ status: ex.status, duplicate: data.duplicate, own: data.own_transfer });
      if (data.own_transfer) toast.info('Looks like a transfer between your own accounts — tagged as internal transfer.');
      if (data.duplicate) toast.error('This UTR is already saved — check before saving again.');
      if (ex.status === 'failed') toast.error('The proof shows a FAILED transaction — do not save unless it actually went through.');
      if (data.suggested_vendor) {
        toast.success(`Matched vendor: ${data.suggested_vendor.vendor_name} (${data.suggested_vendor.confidence}%)`);
      } else {
        toast.success('Details extracted — review & classify below');
      }
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setExtracting(false);
    }
  };

  const save = async () => {
    if (!form.comment.trim()) return toast.error('The additional comment is mandatory');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount');
    setSaving(true);
    try {
      const body = {
        ...form,
        amount: Number(form.amount),
        proof_document_id: documentId,
        txn_kind: form.txn_kind || 'expense',
        override_duplicate: override,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        project_id: form.project_id || null, site_id: form.site_id || null,
        vendor_id: form.txn_kind === 'expense' && form.payee_type === 'vendor' ? (form.vendor_id || null) : null,
        employee_id: form.txn_kind === 'expense' && form.payee_type === 'employee' ? (form.employee_id || null) : null,
        category_id: form.category_id || null,
        payment_date: form.payment_date || null,
      };
      if (isEdit) await api.patch(`/payments/${initial.id}`, body);
      else await api.post('/payments', body);
      onSaved();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit Payment' : 'New Outgoing Payment'}
      size="lg"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : (isEdit ? 'Update Payment' : 'Save Payment')}
          </button>
        </>
      }
    >
      {/* Step 1 — upload & OCR (operator-only; OCR is disabled for the admin) */}
      {canImport && (
      <div className="mb-5 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-4 dark:border-brand-900 dark:bg-brand-900/10">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-100 p-2 text-brand-600 dark:bg-brand-900/40">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Auto-extract from proof</p>
            <p className="text-xs text-slate-500">Upload a screenshot or PDF — fields fill in automatically.</p>
          </div>
          <label className="btn-primary cursor-pointer">
            {extracting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
            {extracting ? 'Reading…' : 'Upload Proof'}
            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={onFile} disabled={extracting} />
          </label>
        </div>
        {documentId && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <Paperclip size={12} /> Proof attached & processed
          </p>
        )}
      </div>
      )}

      {/* Extraction warnings — failed txn / duplicate UTR / internal transfer */}
      {warn && (warn.status === 'failed' || warn.duplicate || warn.own) && (
        <div className="mb-5 space-y-2">
          {warn.status === 'failed' && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
              The proof appears to show a <strong>FAILED / unsuccessful</strong> transaction. Do not save unless the money actually moved.
            </div>
          )}
          {warn.duplicate && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
              This reference/UTR is already saved as a payment{warn.duplicate.payment_date ? ` on ${fmtDate(warn.duplicate.payment_date)}` : ''}. Saving again will double-count it.
              <label className="mt-1 flex items-center gap-2">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                Yes, this is a genuinely different transaction — save anyway.
              </label>
            </div>
          )}
          {warn.own && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 dark:border-brand-900 dark:bg-brand-900/20 dark:text-brand-300">
              Counterparty matches one of your <strong>own accounts</strong> — tagged as an <strong>internal transfer</strong> (excluded from expenses).
            </div>
          )}
        </div>
      )}

      {/* Step 2 — verify extracted fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Amount" required>
          <input className="input" type="number" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" />
        </Field>
        <Field label="Payment Date">
          <input className="input" type="date" value={form.payment_date || ''} onChange={set('payment_date')} />
        </Field>
        <Field label="Reference / UTR">
          <input className="input" value={form.reference_id} onChange={set('reference_id')} />
        </Field>
        <Field label="Beneficiary">
          <input className="input" value={form.beneficiary_name} onChange={set('beneficiary_name')} />
        </Field>
        <Field label="Payment Mode">
          <select className="input" value={form.payment_mode} onChange={set('payment_mode')}>
            {['neft', 'rtgs', 'imps', 'upi', 'net_banking', 'cheque', 'cash', 'other'].map((m) => (
              <option key={m} value={m}>{m.toUpperCase()}</option>
            ))}
          </select>
        </Field>
        <Field label="Account Details">
          <input className="input" value={form.account_details} onChange={set('account_details')} />
        </Field>
        <Field label="Bank Remark (auto-extracted)" hint="Pulled from the proof; editable">
          <input className="input" value={form.bank_remarks} onChange={set('bank_remarks')} placeholder="Remark / narration from the screenshot" />
        </Field>
      </div>

      {/* Step 3 — classification */}
      <h4 className="mb-3 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-200">Classification</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Transaction Type" hint="Internal transfer / financing are excluded from expense totals">
          <select className="input" value={form.txn_kind} onChange={set('txn_kind')}>
            <option value="expense">Expense (real payment to a vendor/employee)</option>
            <option value="internal_transfer">Internal transfer (between your own accounts)</option>
            <option value="financing">Financing (loan / OD drawdown or repayment)</option>
          </select>
        </Field>
        <Field label="Payee Type">
          <div className="flex gap-2">
            {['vendor', 'employee'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, payee_type: t }))}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${form.payee_type === t ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        {form.payee_type === 'vendor' ? (
          <Field label="Vendor">
            <select className="input" value={form.vendor_id} onChange={set('vendor_id')}>
              <option value="">Select vendor</option>
              {vendors?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Employee">
            <select className="input" value={form.employee_id} onChange={set('employee_id')}>
              <option value="">Select employee</option>
              {employees?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Category">
          <select className="input" value={form.category_id} onChange={set('category_id')}>
            <option value="">Select category</option>
            {categories?.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Project">
          <select className="input" value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value, site_id: '' }))}>
            <option value="">Select project</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Site">
          <select className="input" value={form.site_id} onChange={set('site_id')} disabled={!form.project_id}>
            <option value="">Select site</option>
            {siteOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Material Type">
          <input className="input" value={form.material_type} onChange={set('material_type')} placeholder="e.g. 2 ton steel" />
        </Field>
        <Field label="Tags" hint="Comma separated">
          <input className="input" value={form.tags} onChange={set('tags')} placeholder="advance, urgent" />
        </Field>
      </div>

      {/* Mandatory comment */}
      <div className="mt-5">
        <Field label="Additional Comment" required hint="Business meaning lives here — required before saving.">
          <textarea
            className="input min-h-[80px]"
            value={form.comment}
            onChange={set('comment')}
            placeholder="e.g. Advance paid for 2 ton steel — Samsung Site Phase 4"
          />
        </Field>
      </div>

      {ocrPreview && (
        <details className="mt-4 text-xs text-slate-400">
          <summary className="cursor-pointer font-medium">View raw OCR text</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 dark:bg-slate-800">{ocrPreview}</pre>
        </details>
      )}
    </Modal>
  );
}
