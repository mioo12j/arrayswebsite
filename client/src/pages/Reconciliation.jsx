import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Loader2, CheckCircle2, AlertCircle, Copy, ChevronRight, HeartPulse, Trash2 } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Table, Badge, Field } from '../components/ui/index.jsx';
import { fmtDate, fmtDateTime } from '../lib/format.js';

export default function Reconciliation() {
  const toast = useToast();
  const { canImport, canWrite } = useAuth();
  const { data: statements, loading, refetch } = useFetch('/reconciliation/statements');
  const { data: summary, refetch: refetchSummary } = useFetch('/reconciliation/summary');
  const [open, setOpen] = useState(false);
  const [healthFor, setHealthFor] = useState(null);
  const [healthAll, setHealthAll] = useState(false);

  const delStatement = async (st) => {
    if (!window.confirm(`Delete statement "${st.label}"? The parsed lines are removed, but the payments & receipts already imported from it are KEPT (they are real transactions).`)) return;
    try { await api.delete(`/reconciliation/statements/${st.id}`); toast.success('Statement deleted'); refetch(); refetchSummary(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const s = summary || {};
  const cards = [
    { label: 'Matched', value: s.matched || 0, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Unmatched', value: s.unmatched || 0, icon: AlertCircle, tone: 'text-red-600 bg-red-50' },
    { label: 'Pending Review', value: s.pending_review || 0, icon: AlertCircle, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Missing', value: s.missing || 0, icon: HeartPulse, tone: (s.missing ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50') },
  ];

  return (
    <div>
      <PageHeader
        title="Bank Statement Reconciliation"
        subtitle="Upload a monthly statement — the system auto-matches transactions and flags what needs review."
        actions={<>
          <button className="btn-ghost" onClick={() => setHealthAll(true)}><HeartPulse size={16} /> Check All Health</button>
          {canImport && <button className="btn-primary" onClick={() => setOpen(true)}><Upload size={16} /> Upload Statement</button>}
        </>}
      />

      {s.missing > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-900/20">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div className="text-sm text-red-700 dark:text-red-300">
            <p className="font-semibold">{s.missing} transaction{s.missing > 1 ? 's' : ''} from {s.statements_affected} statement{s.statements_affected > 1 ? 's' : ''} {s.missing > 1 ? 'have' : 'has'} been deleted — {s.statements_affected > 1 ? 'those statements' : 'that statement'} no longer reconcile.</p>
            <p className="mt-0.5 text-xs">Open the flagged statement{s.statements_affected > 1 ? 's' : ''} below (red “missing” badge) and check Health. If any was an extra entry, restore it from the Recovery Center and mark it <strong>Duplicate</strong> instead of deleting.</p>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">{c.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{c.value}</p>
              </div>
              <div className={`rounded-xl p-2.5 ${c.tone}`}><c.icon size={20} /></div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="!p-0">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><h3 className="font-semibold text-slate-800 dark:text-slate-100">Uploaded Statements</h3></div>
        {loading ? <Loading /> : (
          <Table
            columns={[
              { header: 'Statement' }, { header: 'Uploaded' }, { header: 'Lines' }, { header: 'Matched' },
              { header: 'Unmatched' }, { header: 'Review' }, { header: 'Health' }, { header: '' },
            ]}
            rows={statements || []}
            empty="No statements uploaded yet."
            onRowClick={(st) => (window.location.href = `/reconciliation/${st.id}`)}
            renderRow={(st) => (
              <>
                <td className="td font-medium text-slate-800 dark:text-slate-100">{st.label}</td>
                <td className="td text-slate-500">{fmtDateTime(st.created_at)}</td>
                <td className="td">{st.total_lines}</td>
                <td className="td"><Badge tone="green">{st.matched_count}</Badge></td>
                <td className="td">{st.unmatched_count > 0 ? <Badge tone="red">{st.unmatched_count}</Badge> : '0'}</td>
                <td className="td">{st.pending_review > 0 ? <Badge tone="amber">{st.pending_review}</Badge> : '—'}</td>
                <td className="td">{Number(st.missing_count) > 0
                  ? <Badge tone="red" title="Transactions that were on this statement have been deleted">{st.missing_count} missing</Badge>
                  : <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 size={13} /> OK</span>}</td>
                <td className="td text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className="btn-ghost !py-1 !px-2 !text-xs" title="Check statement health" onClick={(e) => { e.stopPropagation(); setHealthFor(st); }}><HeartPulse size={14} /></button>
                    {canWrite && <button className="btn-ghost !py-1 !px-2 !text-xs !text-red-600" title="Delete statement" onClick={(e) => { e.stopPropagation(); delStatement(st); }}><Trash2 size={14} /></button>}
                    <ChevronRight size={16} className="text-slate-300" />
                  </div>
                </td>
              </>
            )}
          />
        )}
      </Card>

      {open && <UploadModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); refetch(); refetchSummary(); }} />}
      {healthFor && <HealthModal statement={healthFor} onClose={() => setHealthFor(null)} />}
      {healthAll && <AllHealthModal onClose={() => setHealthAll(false)} onOpenOne={(st) => { setHealthAll(false); setHealthFor(st); }} />}
    </div>
  );
}

// One place to see the health of EVERY statement — which reconcile cleanly and
// which have transactions that were deleted (worst first).
function AllHealthModal({ onClose, onOpenOne }) {
  const { data, loading } = useFetch('/reconciliation/health-all');
  return (
    <Modal open onClose={onClose} title="Health of All Statements" size="lg"
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      {loading ? <Loading /> : !data ? <p className="text-sm text-slate-500">Could not load.</p> : (
        <div>
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${data.healthy
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300'}`}>
            {data.healthy
              ? <><CheckCircle2 size={16} className="mr-1 inline" /> All {data.total_statements} statement{data.total_statements === 1 ? '' : 's'} reconcile — nothing missing.</>
              : <><AlertCircle size={16} className="mr-1 inline" /> {data.total_missing} transaction{data.total_missing === 1 ? '' : 's'} missing across {data.statements_affected} of {data.total_statements} statements.</>}
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400 dark:bg-slate-800">
                <tr><th className="px-3 py-2">Statement</th><th className="px-3 py-2">Uploaded</th><th className="px-3 py-2 text-center">Lines</th><th className="px-3 py-2 text-center">Health</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody>
                {(data.statements || []).map((st) => (
                  <tr key={st.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{st.label}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtDate(st.created_at)}</td>
                    <td className="px-3 py-2 text-center">{st.total_lines}</td>
                    <td className="px-3 py-2 text-center">{Number(st.missing) > 0
                      ? <Badge tone="red">{st.missing} missing</Badge>
                      : <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 size={13} /> OK</span>}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(st.missing) > 0 && <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => onOpenOne(st)}>Details</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Cross-checks every matched line against the live record and lists any that are
// broken (a payment/receipt that was on this statement has since been deleted).
function HealthModal({ statement, onClose }) {
  const { data, loading } = useFetch(`/reconciliation/statements/${statement.id}/health`);
  return (
    <Modal open onClose={onClose} title={`Statement Health — ${statement.label}`} size="lg"
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      {loading ? <Loading /> : !data ? <p className="text-sm text-slate-500">Could not load health.</p> : (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total lines', value: data.total, tone: 'text-slate-700' },
              { label: 'Reconciled', value: data.matched_ok, tone: 'text-emerald-600' },
              { label: 'Pending', value: data.unmatched, tone: 'text-amber-600' },
              { label: 'Missing', value: data.broken_count, tone: data.broken_count ? 'text-red-600' : 'text-slate-400' },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-700">
                <p className="text-[11px] font-semibold uppercase text-slate-400">{c.label}</p>
                <p className={`text-xl font-bold ${c.tone}`}>{c.value}</p>
              </div>
            ))}
          </div>
          {data.healthy ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300">
              <CheckCircle2 size={16} className="mr-1 inline" /> Every transaction on this statement is present and accounted for.
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm font-semibold text-red-600">These transactions were on the statement but have been deleted — the statement no longer fully reconciles:</p>
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400 dark:bg-slate-800">
                    <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Reason</th></tr>
                  </thead>
                  <tbody>
                    {data.broken.map((b) => (
                      <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(b.txn_date)}</td>
                        <td className="px-3 py-2 max-w-[240px] truncate" title={b.description}>{b.description}</td>
                        <td className="px-3 py-2 capitalize">{b.matched_type}</td>
                        <td className="px-3 py-2 text-right font-semibold">{Number(b.debit) > 0 ? `− ${b.debit}` : `+ ${b.credit}`}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{b.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">Tip: if one of these was an extra/duplicate, restore it from the Recovery Center and mark it <strong>Duplicate</strong> instead of deleting — that keeps the statement reconciled.</p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function UploadModal({ onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ label: '', bank_name: '', account_number: '', period_start: '', period_end: '' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async () => {
    if (!file) return toast.error('Choose a statement file');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      const { data } = await api.post('/reconciliation/statements', fd);
      const st = data.statement;
      toast.success(`Parsed ${st.total_lines} lines — ${st.matched_count} matched, ${st.unmatched_count} to review`);
      onDone();
    } catch (err) { toast.error(apiError(err)); } finally { setUploading(false); }
  };

  return (
    <Modal open onClose={onClose} title="Upload Bank Statement"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={upload} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" size={16} /> : 'Upload & Reconcile'}</button>
      </>}>
      <p className="mb-4 text-sm text-slate-500">Supported: PDF, Excel (.xlsx) or CSV bank statements. The system reads debits & credits and matches them against your recorded payments and receipts.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Label"><input className="input" value={form.label} onChange={set('label')} placeholder="HDFC — April 2026" /></Field>
        <Field label="Bank Name"><input className="input" value={form.bank_name} onChange={set('bank_name')} /></Field>
        <Field label="Account Number"><input className="input" value={form.account_number} onChange={set('account_number')} /></Field>
        <div />
        <Field label="Period Start"><input className="input" type="date" value={form.period_start} onChange={set('period_start')} /></Field>
        <Field label="Period End"><input className="input" type="date" value={form.period_end} onChange={set('period_end')} /></Field>
      </div>
      <div className="mt-4">
        <Field label="Statement File" required>
          <input className="input !py-2" type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
      </div>
    </Modal>
  );
}
