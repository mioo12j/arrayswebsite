import { useState, useRef } from 'react';
import { Plus, Search, Loader2, ChevronRight, Upload, GitMerge, AlertTriangle } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Table, Badge, Field } from '../components/ui/index.jsx';
import { inr } from '../lib/format.js';

export default function Vendors() {
  const toast = useToast();
  const { canImport } = useAuth();
  const [candidatesOnly, setCandidatesOnly] = useState(false);
  const { data: vendors, loading, refetch } = useFetch(candidatesOnly ? '/vendors?candidates=1' : '/vendors', [candidatesOnly]);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [mergeVendor, setMergeVendor] = useState(null);
  const fileRef = useRef(null);
  const filtered = (vendors || []).filter((v) => v.name.toLowerCase().includes(search.toLowerCase()));
  const candidateCount = (vendors || []).filter((v) => v.is_candidate).length;

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/vendors/import', fd);
      toast.success(`Imported ${data.imported} vendors (${data.accounts_linked} accounts linked)`);
      refetch();
    } catch (err) { toast.error(apiError(err)); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div>
      <PageHeader
        title="Vendor Master"
        subtitle="Vendor-wise ledgers, beneficiary accounts and auto-mapping intelligence."
        actions={<>
          {canImport && (
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} Import List
            </button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImport} />
          <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New Vendor</button>
        </>}
      />

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button
            className={`btn-ghost ${candidatesOnly ? '!border-amber-400 !text-amber-700 !bg-amber-50' : ''}`}
            onClick={() => setCandidatesOnly((v) => !v)}
            title="Auto-created vendors from bank imports that need review / merging"
          >
            <AlertTriangle size={16} /> {candidatesOnly ? 'Showing candidates' : 'Review candidates'}
            {!candidatesOnly && candidateCount > 0 && <Badge tone="amber" className="ml-1">{candidateCount}</Badge>}
          </button>
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table
            columns={[
              { header: 'Vendor' }, { header: 'Category' }, { header: 'GSTIN' },
              { header: 'Total Paid', align: 'right' }, { header: 'Outstanding', align: 'right' },
              { header: 'Pending Inv.' }, { header: '' },
            ]}
            rows={filtered}
            empty={candidatesOnly ? 'No candidate vendors to review.' : 'No vendors yet.'}
            onRowClick={(v) => (window.location.href = `/vendors/${v.id}`)}
            renderRow={(v) => (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">
                  {v.name}
                  {v.is_candidate && <Badge tone="amber" className="ml-2">candidate</Badge>}
                </td>
                <td className="td">{v.category || '—'}</td>
                <td className="td font-mono text-xs">{v.gstin || '—'}</td>
                <td className="td text-right">{inr(v.total_paid)}</td>
                <td className="td text-right">
                  {Number(v.balance) > 0
                    ? <span className="font-semibold text-amber-600">{inr(v.balance)}</span>
                    : Number(v.balance) < 0
                      ? <span className="text-emerald-600" title="You have paid more than billed (advance / payment without a recorded bill)">{inr(0)} <span className="text-[11px] text-slate-400">· adv {inr(-v.balance)}</span></span>
                      : <span className="text-slate-400">{inr(0)}</span>}
                </td>
                <td className="td">{v.pending_invoices > 0 ? <Badge tone="amber">{v.pending_invoices}</Badge> : '—'}</td>
                <td className="td text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className="btn-ghost !py-1 !px-2 !text-xs" title="Merge into another vendor"
                      onClick={(e) => { e.stopPropagation(); setMergeVendor(v); }}>
                      <GitMerge size={14} />
                    </button>
                    <ChevronRight size={16} className="text-slate-300" />
                  </div>
                </td>
              </>
            )}
          />
        )}
      </Card>

      {open && <VendorModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refetch(); toast.success('Vendor created'); }} />}
      {mergeVendor && <MergeModal vendor={mergeVendor} onClose={() => setMergeVendor(null)} onMerged={() => { setMergeVendor(null); refetch(); toast.success('Vendors merged'); }} />}
    </div>
  );
}

function MergeModal({ vendor, onClose, onMerged }) {
  const toast = useToast();
  const { data: dupes, loading } = useFetch(`/vendors/${vendor.id}/duplicates`);
  const [into, setInto] = useState('');
  const [busy, setBusy] = useState(false);

  const merge = async () => {
    if (!into) return toast.error('Pick the vendor to keep');
    setBusy(true);
    try {
      await api.post(`/vendors/${vendor.id}/merge`, { into });
      onMerged();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Merge "${vendor.name}"`}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-danger" onClick={merge} disabled={busy || !into}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Merge & Delete Duplicate'}</button>
      </>}>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        <strong>{vendor.name}</strong> will be <strong>deleted</strong> and all its payments, accounts and ledger entries moved onto the vendor you keep. This cannot be undone.
      </p>
      {loading ? <Loading /> : (dupes || []).length === 0 ? (
        <p className="text-sm text-slate-500">No similar vendors found. You can only merge when a likely duplicate exists.</p>
      ) : (
        <div className="space-y-2">
          <p className="label">Keep this vendor (survivor):</p>
          {(dupes || []).map((d) => (
            <label key={d.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${into === d.id ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
              <input type="radio" name="survivor" value={d.id} checked={into === d.id} onChange={() => setInto(d.id)} />
              <span className="flex-1">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{d.name}</span>
                {d.is_candidate && <Badge tone="amber" className="ml-2">candidate</Badge>}
              </span>
              <span className="text-xs text-slate-400">{d.payment_count} pmts · {Math.round(d.score * 100)}% match</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

function VendorModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', category: '', material_type: '', tags: '', gstin: '', contact_name: '', phone: '', email: '', address: '', bank_account: '', ifsc: '', opening_balance: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return toast.error('Vendor name is required');
    setSaving(true);
    try {
      await api.post('/vendors', {
        ...form,
        opening_balance: Number(form.opening_balance || 0),
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      });
      onSaved();
    } catch (err) { toast.error(apiError(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="New Vendor"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Create Vendor'}</button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Vendor Name" required><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="Category"><input className="input" value={form.category} onChange={set('category')} placeholder="Steel, Transport…" /></Field>
        <Field label="Material Type"><input className="input" value={form.material_type} onChange={set('material_type')} placeholder="Panels, cables…" /></Field>
        <Field label="Tags" hint="Comma separated"><input className="input" value={form.tags} onChange={set('tags')} placeholder="labour, recurring" /></Field>
        <Field label="GSTIN"><input className="input" value={form.gstin} onChange={set('gstin')} /></Field>
        <Field label="Contact Person"><input className="input" value={form.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" value={form.email} onChange={set('email')} /></Field>
        <Field label="Bank Account" hint="Used for auto-mapping bank transactions"><input className="input" value={form.bank_account} onChange={set('bank_account')} /></Field>
        <Field label="IFSC"><input className="input" value={form.ifsc} onChange={set('ifsc')} /></Field>
        <Field label="Opening Balance" hint="Amount you currently owe this vendor"><input className="input" type="number" step="0.01" value={form.opening_balance} onChange={set('opening_balance')} /></Field>
      </div>
      <div className="mt-4"><Field label="Address"><textarea className="input min-h-[60px]" value={form.address} onChange={set('address')} /></Field></div>
    </Modal>
  );
}
