import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Wand2, DownloadCloud, FileDown } from 'lucide-react';
import { api, apiError, download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, Loading, Table, Badge, Field } from '../components/ui/index.jsx';
import ProofView from '../components/ui/ProofView.jsx';
import { inr, fmtDate } from '../lib/format.js';

export default function ReconciliationDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, refetch } = useFetch(`/reconciliation/statements/${id}`);
  const [resolving, setResolving] = useState(null);
  const [importing, setImporting] = useState(false);

  if (loading) return <Loading />;
  if (!data) return null;
  const { statement, lines } = data;
  const pendingCount = lines.filter((l) => l.status === 'unmatched' && !l.classified).length;

  const importMissing = async () => {
    setImporting(true);
    try {
      const { data: r } = await api.post(`/reconciliation/statements/${id}/import-missing`);
      toast.success(`Imported ${r.payments} payment(s), ${r.receipts} receipt(s); created ${r.newVendors} vendor(s), ${r.newClients} client(s)`);
      refetch();
    } catch (e) { toast.error(apiError(e)); } finally { setImporting(false); }
  };

  return (
    <div>
      <Link to="/reconciliation" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600">
        <ArrowLeft size={16} /> Back to reconciliation
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{statement.label}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {statement.bank_name || 'Bank'}{statement.account_number ? ` · ${statement.account_number}` : ''} ·
            {' '}{statement.total_lines} lines · {statement.matched_count} matched · {statement.unmatched_count} unmatched
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statement.document_id && <ProofView documentId={statement.document_id} name={`${statement.label || 'statement'}`} label="Open statement" />}
          <button className="btn-ghost" onClick={() => download(`/reports/reconciliation/${id}?format=pdf`)}><FileDown size={16} /> Export</button>
          <button className="btn-primary" onClick={importMissing} disabled={importing || pendingCount === 0}>
            {importing ? <Loader2 className="animate-spin" size={16} /> : <DownloadCloud size={16} />}
            Import {pendingCount} Missing
          </button>
        </div>
      </div>

      <Card className="!p-0">
        <Table
          columns={[
            { header: 'Date' }, { header: 'Mode' }, { header: 'Beneficiary / Account' }, { header: 'Reference' },
            { header: 'Debit', align: 'right' }, { header: 'Credit', align: 'right' },
            { header: 'Auto-map' }, { header: 'Status' }, { header: '' },
          ]}
          rows={lines}
          empty="No lines."
          renderRow={(l) => (
            <>
              <td className="td whitespace-nowrap">{fmtDate(l.txn_date)}{l.txn_time ? <div className="text-xs text-slate-400">{l.txn_time}</div> : null}</td>
              <td className="td">{l.mode ? <Badge tone="blue">{l.mode}</Badge> : '—'}</td>
              <td className="td">
                <div className="font-medium text-slate-700 dark:text-slate-200">{l.beneficiary || '—'}</div>
                {l.account_number && <div className="font-mono text-xs text-slate-400">A/c {l.account_number}</div>}
              </td>
              <td className="td font-mono text-xs">{l.reference_id || '—'}</td>
              <td className="td text-right text-red-600">{l.debit > 0 ? inr(l.debit) : '—'}</td>
              <td className="td text-right text-emerald-600">{l.credit > 0 ? inr(l.credit) : '—'}</td>
              <td className="td">
                {l.vendor_id ? <Badge tone={l.vendor_confidence >= 100 ? 'green' : 'amber'}>{l.vendor_confidence >= 100 ? 'Account' : `${l.vendor_confidence || ''}%`}</Badge> : '—'}
              </td>
              <td className="td"><Badge status={l.status} /></td>
              <td className="td text-right">
                {l.status === 'unmatched' && !l.classified ? (
                  <button className="btn-primary !py-1 !px-2.5 !text-xs" onClick={() => setResolving(l)}>
                    <Wand2 size={12} /> Resolve
                  </button>
                ) : l.comment ? (
                  <span className="text-xs text-slate-400" title={l.comment}>noted</span>
                ) : null}
              </td>
            </>
          )}
        />
      </Card>

      {resolving && (
        <ResolveModal
          line={resolving}
          onClose={() => setResolving(null)}
          onDone={() => { setResolving(null); refetch(); }}
        />
      )}
    </div>
  );
}

function ResolveModal({ line, onClose, onDone }) {
  const toast = useToast();
  const isDebit = line.debit > 0;
  const { data: vendors } = useFetch('/vendors');
  const { data: clients } = useFetch('/clients');
  const { data: projects } = useFetch('/projects');
  const { data: categories } = useFetch('/categories');
  const [form, setForm] = useState({
    comment: line.beneficiary ? `${line.mode || 'Payment'} to ${line.beneficiary}` : (line.description || ''),
    vendor_id: line.vendor_id || '', client_id: '', project_id: '', category_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [extraClients, setExtraClients] = useState([]);
  const allClients = [...(clients || []), ...extraClients];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Create a client on the spot so the operator never has to leave reconciliation.
  const quickClient = async () => {
    const name = window.prompt('New client name:', line.beneficiary || line.description || '');
    if (!name || !name.trim()) return;
    try {
      const { data } = await api.post('/clients', { name: name.trim() });
      setExtraClients((x) => [...x, data]);
      setForm((f) => ({ ...f, client_id: data.id }));
      toast.success('Client created');
    } catch (e) { toast.error(apiError(e)); }
  };

  const save = async () => {
    if (!form.comment.trim()) return toast.error('A comment is mandatory');
    if (!isDebit && !form.client_id) return toast.error('Select a client for this credit');
    setSaving(true);
    try {
      await api.post(`/reconciliation/lines/${line.id}/resolve`, {
        comment: form.comment.trim(),
        vendor_id: form.vendor_id || null,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        category_id: form.category_id || null,
      });
      toast.success(`Created ${isDebit ? 'payment' : 'receipt'} & matched line`);
      onDone();
    } catch (err) { toast.error(apiError(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Resolve ${isDebit ? 'Debit (Payment)' : 'Credit (Receipt)'}`}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Create & Match'}</button>
      </>}>
      <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800">
        <div className="flex justify-between"><span className="text-slate-400">Date</span><span>{fmtDate(line.txn_date)}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Amount</span><span className={`font-semibold ${isDebit ? 'text-red-600' : 'text-emerald-600'}`}>{inr(isDebit ? line.debit : line.credit)}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Narration</span><span className="max-w-[260px] truncate">{line.description}</span></div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isDebit ? (
          <>
            <Field label="Vendor">
              <select className="input" value={form.vendor_id} onChange={set('vendor_id')}>
                <option value="">Select vendor</option>
                {vendors?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select className="input" value={form.category_id} onChange={set('category_id')}>
                <option value="">Select category</option>
                {categories?.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <Field label="Client" required>
            <div className="flex gap-2">
              <select className="input flex-1" value={form.client_id} onChange={set('client_id')}>
                <option value="">Select client</option>
                {allClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className="btn-ghost shrink-0" onClick={quickClient} title="Create a new client">+ New</button>
            </div>
          </Field>
        )}
        <Field label="Project">
          <select className="input" value={form.project_id} onChange={set('project_id')}>
            <option value="">Select project</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Mandatory Comment" required hint="Explain what this transaction was for.">
          <textarea className="input min-h-[70px]" value={form.comment} onChange={set('comment')} />
        </Field>
      </div>
    </Modal>
  );
}
