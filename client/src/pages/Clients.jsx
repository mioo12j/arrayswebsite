import { useState } from 'react';
import { Plus, Search, Loader2, ChevronRight, GitMerge, AlertTriangle } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Table, Badge, Field } from '../components/ui/index.jsx';
import { inr } from '../lib/format.js';

export default function Clients() {
  const toast = useToast();
  const [candidatesOnly, setCandidatesOnly] = useState(false);
  const { data: clients, loading, refetch } = useFetch(candidatesOnly ? '/clients?candidates=1' : '/clients', [candidatesOnly]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mergeClient, setMergeClient] = useState(null);
  const filtered = (clients || []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const candidateCount = (clients || []).filter((c) => c.is_candidate).length;

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Client-wise receivable ledgers, billing and overdue tracking."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New Client</button>}
      />

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className={`btn-ghost ${candidatesOnly ? '!border-amber-400 !text-amber-700 !bg-amber-50' : ''}`}
            onClick={() => setCandidatesOnly((v) => !v)} title="Auto-created clients from bank imports that need review / merging">
            <AlertTriangle size={16} /> {candidatesOnly ? 'Showing candidates' : 'Review candidates'}
            {!candidatesOnly && candidateCount > 0 && <Badge tone="amber" className="ml-1">{candidateCount}</Badge>}
          </button>
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table
            columns={[
              { header: 'Client' }, { header: 'GSTIN' }, { header: 'Total Billed', align: 'right' },
              { header: 'Received', align: 'right' }, { header: 'Outstanding', align: 'right' }, { header: 'Overdue' }, { header: '' },
            ]}
            rows={filtered}
            empty={candidatesOnly ? 'No candidate clients to review.' : 'No clients yet.'}
            onRowClick={(c) => (window.location.href = `/clients/${c.id}`)}
            renderRow={(c) => (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">
                  {c.name}{c.is_candidate && <Badge tone="amber" className="ml-2">candidate</Badge>}
                </td>
                <td className="td font-mono text-xs">{c.gstin || '—'}</td>
                <td className="td text-right">{inr(c.total_billed)}</td>
                <td className="td text-right text-emerald-600">{inr(c.total_received)}</td>
                <td className="td text-right font-semibold text-amber-600">{inr(c.outstanding)}</td>
                <td className="td">{c.overdue_invoices > 0 ? <Badge tone="red">{c.overdue_invoices}</Badge> : '—'}</td>
                <td className="td text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className="btn-ghost !py-1 !px-2 !text-xs" title="Merge into another client"
                      onClick={(e) => { e.stopPropagation(); setMergeClient(c); }}><GitMerge size={14} /></button>
                    <ChevronRight size={16} className="text-slate-300" />
                  </div>
                </td>
              </>
            )}
          />
        )}
      </Card>

      {open && <ClientModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refetch(); toast.success('Client created'); }} />}
      {mergeClient && <ClientMergeModal client={mergeClient} onClose={() => setMergeClient(null)} onMerged={() => { setMergeClient(null); refetch(); toast.success('Clients merged'); }} />}
    </div>
  );
}

function ClientMergeModal({ client, onClose, onMerged }) {
  const toast = useToast();
  const { data: dupes, loading } = useFetch(`/clients/${client.id}/duplicates`);
  const [into, setInto] = useState('');
  const [busy, setBusy] = useState(false);
  const merge = async () => {
    if (!into) return toast.error('Pick the client to keep');
    setBusy(true);
    try { await api.post(`/clients/${client.id}/merge`, { into }); onMerged(); }
    catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Merge "${client.name}"`}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-danger" onClick={merge} disabled={busy || !into}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Merge & Delete Duplicate'}</button>
      </>}>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300"><strong>{client.name}</strong> will be <strong>deleted</strong> and all its receipts, invoices, projects and ledger entries moved onto the client you keep. This cannot be undone.</p>
      {loading ? <Loading /> : (dupes || []).length === 0 ? (
        <p className="text-sm text-slate-500">No similar clients found.</p>
      ) : (
        <div className="space-y-2">
          <p className="label">Keep this client (survivor):</p>
          {(dupes || []).map((d) => (
            <label key={d.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${into === d.id ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
              <input type="radio" name="survivor" value={d.id} checked={into === d.id} onChange={() => setInto(d.id)} />
              <span className="flex-1"><span className="font-semibold text-slate-800 dark:text-slate-100">{d.name}</span>{d.is_candidate && <Badge tone="amber" className="ml-2">candidate</Badge>}</span>
              <span className="text-xs text-slate-400">{d.receipt_count} receipts · {Math.round(d.score * 100)}% match</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ClientModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', gstin: '', contact_name: '', phone: '', email: '', address: '', opening_balance: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return toast.error('Client name is required');
    setSaving(true);
    try {
      await api.post('/clients', { ...form, opening_balance: Number(form.opening_balance || 0) });
      onSaved();
    } catch (err) { toast.error(apiError(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="New Client"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Create Client'}</button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client Name" required><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="GSTIN"><input className="input" value={form.gstin} onChange={set('gstin')} /></Field>
        <Field label="Contact Person"><input className="input" value={form.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" value={form.email} onChange={set('email')} /></Field>
        <Field label="Opening Balance" hint="Amount currently receivable"><input className="input" type="number" step="0.01" value={form.opening_balance} onChange={set('opening_balance')} /></Field>
      </div>
      <div className="mt-4"><Field label="Address"><textarea className="input min-h-[60px]" value={form.address} onChange={set('address')} /></Field></div>
    </Modal>
  );
}
