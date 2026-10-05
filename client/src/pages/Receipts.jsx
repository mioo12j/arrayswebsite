import { useState } from 'react';
import { Plus, Search, Upload, Loader2, Sparkles, Paperclip, FileDown, Trash2, Layers, Pencil, Copy } from 'lucide-react';
import AllocationModal from '../components/AllocationModal.jsx';
import ProofView from '../components/ui/ProofView.jsx';
import { api, apiError, download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Table, Field, Badge, DescList, DescRow } from '../components/ui/index.jsx';
import { inr, fmtDate, fmtDateTime } from '../lib/format.js';
import { PRESETS, presetRange } from '../lib/dateRange.js';

const BLANK = {
  reference_id: '', credited_amount: '', credited_date: '', account_details: '',
  client_id: '', vendor_id: '', invoice_id: '', project_id: '', deduction_amount: '', deduction_reason: '',
  tds_amount: '', retention_amount: '', comment: '', txn_kind: 'income',
};

export default function Receipts() {
  const toast = useToast();
  const [filters, setFilters] = useState({ search: '', client_id: '', project_id: '', from: '', to: '' });
  const [preset, setPreset] = useState('');
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString();

  const applyPreset = (val) => {
    setPreset(val);
    if (val !== 'custom') { const r = presetRange(val); setFilters((f) => ({ ...f, from: r.from, to: r.to })); }
  };

  const { data: receipts, loading, refetch } = useFetch(`/receipts?${qs}`, [qs]);
  const { data: clients } = useFetch('/clients');
  const { data: projects } = useFetch('/projects');
  const { data: invoices } = useFetch('/invoices');
  const { data: vendors } = useFetch('/vendors');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  return (
    <div>
      <PageHeader
        title="Incoming Receipts"
        subtitle="Record client payments. The client ledger and receivables update automatically."
        actions={
          <>
            <button className="btn-ghost" onClick={() => download(`/reports/receipts?format=xlsx&${qs}`)}><FileDown size={16} /> Excel</button>
            <button className="btn-ghost" onClick={() => download(`/reports/receipts?format=pdf&${qs}`)}><FileDown size={16} /> PDF</button>
            <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New Receipt</button>
          </>
        }
      />

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search reference or comment…" value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>
          <select className="input max-w-[180px]" value={filters.client_id} onChange={(e) => setFilters((f) => ({ ...f, client_id: e.target.value }))}>
            <option value="">All clients</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input max-w-[180px]" value={filters.project_id} onChange={(e) => setFilters((f) => ({ ...f, project_id: e.target.value }))}>
            <option value="">All projects</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table
            columns={[
              { header: 'Date' }, { header: 'Reference' }, { header: 'Client' }, { header: 'Invoice' },
              { header: 'TDS' }, { header: 'Retention' }, { header: 'Credited', align: 'right' },
            ]}
            rows={receipts || []}
            empty="No receipts yet."
            onRowClick={(r) => setDetail(r)}
            renderRow={(r) => (
              <>
                <td className="td whitespace-nowrap">{fmtDate(r.credited_date)}</td>
                <td className="td font-mono text-xs">{r.reference_id || '—'}</td>
                <td className="td">{r.client_name || '—'}</td>
                <td className="td">{r.invoice_number || '—'}</td>
                <td className="td">{inr(r.tds_amount, { compact: true })}</td>
                <td className="td">{inr(r.retention_amount, { compact: true })}</td>
                <td className="td text-right font-semibold text-emerald-600">{inr(r.credited_amount)}</td>
              </>
            )}
          />
        )}
      </Card>

      {(open || editing) && (
        <ReceiptModal
          initial={editing}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSaved={() => { setOpen(false); setEditing(null); refetch(); toast.success(editing ? 'Receipt updated & ledger re-posted' : 'Receipt saved & client ledger updated'); }}
          clients={clients} projects={projects} invoices={invoices} vendors={vendors}
        />
      )}

      {detail && <ReceiptDetail receipt={detail} onClose={() => setDetail(null)} onEdit={(r) => { setDetail(null); setEditing(r); }} onChanged={() => { setDetail(null); refetch(); }} onDeleted={() => { setDetail(null); refetch(); toast.success('Receipt moved to Recovery Center'); }} />}
    </div>
  );
}

// Read-only detail view for a single receipt.
function ReceiptDetail({ receipt: r, onClose, onEdit, onChanged, onDeleted }) {
  const toast = useToast();
  const { canWrite } = useAuth();
  const [busy, setBusy] = useState(false);
  const [alloc, setAlloc] = useState(false);
  const fromStatement = r.source === 'reconciliation' || !!r.recon_item_id;
  const isDuplicate = r.txn_kind === 'duplicate';
  const deductions =
    Number(r.tds_amount || 0) + Number(r.retention_amount || 0) + Number(r.deduction_amount || 0);
  const del = async () => {
    const warn = fromStatement
      ? 'This receipt came from a bank statement — deleting it will make that statement no longer reconcile.\n\nUnless it was never really received, prefer "Mark Duplicate" (keeps it linked to the statement but counts it nowhere).\n\nDelete anyway?'
      : 'Delete this receipt? It will move to the Recovery Center (recoverable for 30 days) and its ledger credit is reversed.';
    if (!window.confirm(warn)) return;
    setBusy(true);
    try { await api.delete(`/receipts/${r.id}`); onDeleted(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const markDuplicate = async () => {
    if (!window.confirm('Mark this as a DUPLICATE receipt? It stays on record and linked to its bank statement, but is excluded from every total and its ledger credit is removed.')) return;
    setBusy(true);
    try { await api.patch(`/receipts/${r.id}`, { txn_kind: 'duplicate' }); toast.success('Marked as duplicate — excluded from all totals'); onChanged?.(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const unmarkDuplicate = async () => {
    setBusy(true);
    try { await api.patch(`/receipts/${r.id}`, { txn_kind: 'income' }); toast.success('Restored as normal income'); onChanged?.(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Receipt Details" size="lg"
      footer={<>
        {canWrite && <button className="btn-ghost !text-red-600" onClick={del} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} Delete</button>}
        {canWrite && !isDuplicate && <button className="btn-ghost !text-amber-600" onClick={markDuplicate} disabled={busy}><Copy size={16} /> Mark Duplicate</button>}
        {canWrite && isDuplicate && <button className="btn-ghost" onClick={unmarkDuplicate} disabled={busy}><Copy size={16} /> Unmark Duplicate</button>}
        {canWrite && onEdit && <button className="btn-ghost" onClick={() => onEdit(r)}><Pencil size={16} /> Edit</button>}
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Amount Credited</p>
          <p className="text-2xl font-bold text-emerald-600">{inr(r.credited_amount)}</p>
        </div>
        {deductions > 0 && (
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Deductions</p>
            <p className="text-lg font-semibold text-amber-600">{inr(deductions)}</p>
          </div>
        )}
      </div>

      <DescList>
        <DescRow label="Date">{fmtDate(r.credited_date)}</DescRow>
        <DescRow label="Reference" mono>{r.reference_id}</DescRow>
        <DescRow label="Client">{r.client_name}</DescRow>
        <DescRow label="Linked Invoice">{r.invoice_number}</DescRow>
        <DescRow label="Account Details" mono>{r.account_details}</DescRow>
        <DescRow label="Project">{r.project_name}</DescRow>
        <DescRow label="TDS">{Number(r.tds_amount) ? inr(r.tds_amount) : null}</DescRow>
        <DescRow label="Retention">{Number(r.retention_amount) ? inr(r.retention_amount) : null}</DescRow>
        <DescRow label="Other Deduction">{Number(r.deduction_amount) ? inr(r.deduction_amount) : null}</DescRow>
        <DescRow label="Deduction Reason">{r.deduction_reason}</DescRow>
        <DescRow label="Recorded On">{fmtDateTime(r.created_at)}</DescRow>
        <DescRow label="Comment / Notes" wide>{r.comment}</DescRow>
      </DescList>
      {r.proof_document_id && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Receipt Proof</p>
          <ProofView documentId={r.proof_document_id} name="receipt-proof" label="Open receipt proof" />
        </div>
      )}
      {alloc && (
        <AllocationModal kind="incoming" id={r.id} amount={r.credited_amount}
          meta={{ reference: r.reference_id, date: fmtDate(r.credited_date), party: r.client_name }}
          onClose={() => setAlloc(false)} onSaved={() => setAlloc(false)} />
      )}
    </Modal>
  );
}

function ReceiptModal({ initial, onClose, onSaved, clients, projects, invoices, vendors }) {
  const toast = useToast();
  const { canImport } = useAuth();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(() => (initial ? {
    ...BLANK,
    reference_id: initial.reference_id || '', credited_amount: initial.credited_amount ?? '',
    credited_date: initial.credited_date ? String(initial.credited_date).slice(0, 10) : '',
    account_details: initial.account_details || '', client_id: initial.client_id || '', vendor_id: initial.vendor_id || '',
    invoice_id: initial.invoice_id || '', project_id: initial.project_id || '',
    deduction_amount: initial.deduction_amount ?? '', deduction_reason: initial.deduction_reason || '',
    tds_amount: initial.tds_amount ?? '', retention_amount: initial.retention_amount ?? '',
    comment: initial.comment || '', txn_kind: initial.txn_kind || 'income',
  } : BLANK));
  const [documentId, setDocumentId] = useState(initial?.proof_document_id || null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const clientInvoices = invoices?.filter((i) => !form.client_id || i.client_id === form.client_id) || [];

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/receipts/extract', fd);
      setDocumentId(data.document_id);
      const ex = data.extracted || {};
      setForm((f) => ({
        ...f,
        reference_id: ex.reference_id || f.reference_id,
        credited_amount: ex.credited_amount ?? f.credited_amount,
        credited_date: ex.credited_date || f.credited_date,
        account_details: ex.account_details || f.account_details,
      }));
      toast.success('Details extracted — complete the rest below');
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setExtracting(false);
    }
  };

  const save = async () => {
    if (form.txn_kind === 'income' && !form.client_id) return toast.error('Select a client');
    if (form.txn_kind === 'refund' && !form.vendor_id) return toast.error('Select the vendor this refund came from');
    if (!form.credited_amount || Number(form.credited_amount) <= 0) return toast.error('Enter a valid credited amount');
    setSaving(true);
    try {
      const body = {
        ...form,
        credited_amount: Number(form.credited_amount),
        deduction_amount: Number(form.deduction_amount || 0),
        tds_amount: Number(form.tds_amount || 0),
        retention_amount: Number(form.retention_amount || 0),
        proof_document_id: documentId,
        invoice_id: form.invoice_id || null, project_id: form.project_id || null,
        credited_date: form.credited_date || null,
      };
      if (isEdit) await api.patch(`/receipts/${initial.id}`, body);
      else await api.post('/receipts', body);
      onSaved();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Receipt' : 'New Incoming Receipt'} size="lg"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : (isEdit ? 'Update Receipt' : 'Save Receipt')}
        </button>
      </>}>
      {canImport && (
      <div className="mb-5 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-900/10">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-900/40"><Sparkles size={18} /></div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Auto-extract from credit proof</p>
            <p className="text-xs text-slate-500">Upload the bank credit screenshot or PDF.</p>
          </div>
          <label className="btn-primary cursor-pointer">
            {extracting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
            {extracting ? 'Reading…' : 'Upload Proof'}
            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={onFile} disabled={extracting} />
          </label>
        </div>
        {documentId && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600"><Paperclip size={12} /> Proof attached & processed</p>}
      </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Transaction Type" hint="Only real income counts as revenue">
          <select className="input" value={form.txn_kind} onChange={set('txn_kind')}>
            <option value="income">Income (client payment)</option>
            <option value="refund">Vendor refund (money back from a vendor)</option>
            <option value="internal_transfer">Internal transfer (between your own accounts)</option>
            <option value="financing">Financing (loan / OD)</option>
          </select>
        </Field>
        <div className="hidden sm:block" />
        <Field label="Credited Amount" required>
          <input className="input" type="number" step="0.01" value={form.credited_amount} onChange={set('credited_amount')} />
        </Field>
        <Field label="Credited Date">
          <input className="input" type="date" value={form.credited_date || ''} onChange={set('credited_date')} />
        </Field>
        <Field label="Reference Number">
          <input className="input" value={form.reference_id} onChange={set('reference_id')} />
        </Field>
        <Field label="Account Details">
          <input className="input" value={form.account_details} onChange={set('account_details')} />
        </Field>
        {form.txn_kind === 'refund' ? (
          <Field label="Vendor (refund from)" required>
            <select className="input" value={form.vendor_id} onChange={set('vendor_id')}>
              <option value="">Select vendor</option>
              {vendors?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
        ) : form.txn_kind === 'income' ? (
          <Field label="Client" required>
            <select className="input" value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value, invoice_id: '' }))}>
              <option value="">Select client</option>
              {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Party"><input className="input" value="— none (internal/financing) —" disabled /></Field>
        )}
        {form.txn_kind === 'income' && (
          <Field label="Linked Invoice">
            <select className="input" value={form.invoice_id} onChange={set('invoice_id')}>
              <option value="">None</option>
              {clientInvoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number} ({inr(i.total_amount, { compact: true })})</option>)}
            </select>
          </Field>
        )}
        <Field label="Project">
          <select className="input" value={form.project_id} onChange={set('project_id')}>
            <option value="">Select project</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="TDS Amount">
          <input className="input" type="number" step="0.01" value={form.tds_amount} onChange={set('tds_amount')} />
        </Field>
        <Field label="Retention Amount">
          <input className="input" type="number" step="0.01" value={form.retention_amount} onChange={set('retention_amount')} />
        </Field>
        <Field label="Other Deduction">
          <input className="input" type="number" step="0.01" value={form.deduction_amount} onChange={set('deduction_amount')} />
        </Field>
        <Field label="Deduction Reason">
          <input className="input" value={form.deduction_reason} onChange={set('deduction_reason')} />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Comment / Notes">
          <textarea className="input min-h-[70px]" value={form.comment} onChange={set('comment')} placeholder="e.g. Milestone 2 payment received from Tata Power Solar" />
        </Field>
      </div>
    </Modal>
  );
}
