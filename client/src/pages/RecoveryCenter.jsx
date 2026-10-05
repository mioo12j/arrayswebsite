import { useState } from 'react';
import { LifeBuoy, Undo2, ShieldCheck, Download, DatabaseBackup, Activity, Loader2, FileText, Truck, ClipboardList, ArrowRight, ReceiptText, Banknote, FolderKanban, ArrowDownLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader, Card, Loading, Badge, EmptyState } from '../components/ui/index.jsx';
import { gstDownload, inr, dmyt } from '../lib/gst.js';

const kb = (b) => (b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`);

export default function RecoveryCenter() {
  const toast = useToast();
  const { data: deleted, loading, refetch } = useFetch('/gst/recovery/deleted');
  const { data: backups, refetch: refetchBackups } = useFetch('/gst/backups');
  const [busy, setBusy] = useState('');

  const recover = async (type, id) => {
    if (!window.confirm('Recover this deleted record back into the system?')) return;
    setBusy(id);
    try { await api.post('/gst/recovery/restore', { type, id }); toast.success('Record recovered'); refetch(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  const verify = async (id) => {
    setBusy(id);
    try { const { data } = await api.post(`/gst/backups/${id}/verify`); toast.success(`Verification: ${data.status}`); refetchBackups(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };

  const groups = [
    { key: 'einvoices', label: 'E-Invoices', icon: FileText, type: 'einvoice', cols: ['doc_no', 'buyer_name', 'total_inv_val'] },
    { key: 'ewbs', label: 'E-Way Bills', icon: Truck, type: 'ewb', cols: ['ewb_no', 'to_trade_name', 'tot_inv_value'] },
    { key: 'challans', label: 'Delivery Challans', icon: ClipboardList, type: 'challan', cols: ['challan_no', 'consignee', 'total_value'] },
    { key: 'invoices', label: 'Invoices', icon: ReceiptText, type: 'invoice', cols: ['invoice_number', 'customer_name', 'total_amount'] },
    { key: 'payments', label: 'Outgoing Payments', icon: Banknote, type: 'payment', cols: ['reference_id', 'payee', 'amount'] },
    { key: 'receipts', label: 'Incoming Receipts', icon: ArrowDownLeft, type: 'receipt', cols: ['reference_id', 'client', 'credited_amount'] },
    { key: 'projects', label: 'Projects', icon: FolderKanban, type: 'project', cols: ['name', 'client', 'contract_value'] },
  ];

  return (
    <div>
      <PageHeader title="System Recovery Center" subtitle="Recover deleted records, verify and restore backups, and review the audit trail — your safety net against data loss." />

      {/* Deleted records recovery */}
      <Card className="!p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><Undo2 size={16} /> Deleted Records</h3>
          <span className="text-sm text-slate-400">{deleted?.total ?? 0} recoverable</span>
        </div>
        <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400">
          Deleted records are kept here for <b>30 days</b>, then permanently removed. Recover anything you still need before then.
        </div>
        {loading ? <Loading /> : !deleted?.total ? <EmptyState title="No deleted records" hint="Anything you delete can be recovered here for 30 days." /> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {groups.map((g) => (deleted[g.key] || []).length > 0 && (
              <div key={g.key} className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400"><g.icon size={13} /> {g.label} ({deleted[g.key].length})</p>
                <div className="space-y-1.5">
                  {deleted[g.key].map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/40">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{r[g.cols[0]] || '—'}</span>
                        <span className="text-slate-500"> · {r[g.cols[1]] || '—'} · {inr(r[g.cols[2]])}</span>
                        {r.deleted_at && <span className="ml-1 text-xs text-slate-400">(deleted {dmyt(r.deleted_at)})</span>}
                      </div>
                      <button className="btn-ghost !py-1 !text-xs" disabled={busy === r.id} onClick={() => recover(g.type, r.id)}>
                        {busy === r.id ? <Loader2 className="animate-spin" size={13} /> : <Undo2 size={13} />} Recover
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recovery points (backups) */}
      <Card className="mt-4 !p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><DatabaseBackup size={16} /> Recovery Points (Backups)</h3>
          <Link to="/gst/backup" className="text-sm font-medium text-brand-600 hover:underline">Full backup &amp; restore manager <ArrowRight size={13} className="inline" /></Link>
        </div>
        {!backups?.length ? <EmptyState title="No backups yet" hint="Auto-backup runs every 2 hours; or create one in the backup manager." /> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {backups.slice(0, 12).map((b) => {
              const total = Object.values(b.record_counts || {}).reduce((a, c) => a + Number(c), 0);
              return (
                <div key={b.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-slate-800 dark:text-slate-100">{dmyt(b.started_at)}</span>
                    <span className="text-slate-400 capitalize"> · {b.kind} · {total} records · {kb(b.size_bytes)}</span>
                    {b.health != null && <Badge tone={b.health >= 80 ? 'green' : b.health >= 50 ? 'amber' : 'red'} className="ml-2">{b.health}/100</Badge>}
                    {b.verification?.status && <Badge tone={b.verification.status === 'verified' ? 'green' : b.verification.status === 'warning' ? 'amber' : 'red'} className="ml-1">{b.verification.status}</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={busy === b.id} onClick={() => verify(b.id)} title="Verify integrity"><ShieldCheck size={13} /></button>
                    <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={!b.exists} onClick={() => gstDownload(`/gst/backups/${b.id}/download`, 'backup.zip')} title="Download"><Download size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mt-4 !p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Activity size={16} className="text-slate-400" />
          <Link to="/activity" className="font-medium text-brand-600 hover:underline">Audit timeline</Link>
          <Link to="/gst/activity" className="font-medium text-brand-600 hover:underline">GST activity log</Link>
          <Link to="/status" className="font-medium text-brand-600 hover:underline">System status &amp; sync</Link>
          <span className="text-slate-400">Every create, edit, delete, dispatch and recovery is recorded in the immutable audit trail.</span>
        </div>
      </Card>
    </div>
  );
}
