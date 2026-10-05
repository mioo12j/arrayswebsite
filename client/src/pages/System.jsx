import { useState } from 'react';
import { DatabaseZap, Trash2, Sparkles, Loader2, AlertTriangle, CloudUpload, Copy, Check } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader } from '../components/ui/index.jsx';

const SYNC_COMMAND = 'cd server\nnpm run sync';

export default function System() {
  const toast = useToast();
  const { isEditor } = useAuth();
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null); // 'demo' | 'clear'
  const [typed, setTyped] = useState('');
  const [copied, setCopied] = useState(false);
  const { data: cloud } = useFetch('/system/cloud-status');

  const run = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'demo') {
        const { data } = await api.post('/system/seed-demo');
        toast.success(`Demo data loaded — ${data.clients} clients, ${data.vendors} vendors, ${data.payments} payments, ${data.receipts} receipts…`);
      } else {
        await api.post('/system/clear-data');
        toast.success('All operational data cleared. The portal is now empty.');
      }
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(''); setConfirm(null); setTyped(''); }
  };

  const publish = async () => {
    setBusy('publish');
    try {
      const { data } = await api.post('/system/sync-to-cloud');
      toast.success(`Published ${data.total} records to the cloud. The admin can now view them on the web.`);
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(''); }
  };

  const exportData = async () => {
    setBusy('export');
    try {
      const res = await api.get('/system/export-data', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `AIPL-data-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success('All data downloaded as one JSON file');
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(''); }
  };

  const copyCmd = () => {
    navigator.clipboard?.writeText(SYNC_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <PageHeader
        title="Data Management"
        subtitle="Publish your local data to the cloud so the admin can view it on the web."
      />

      {isEditor && (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/10">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          The demo / clear actions affect the <strong>entire portal</strong> and cannot be undone. User accounts are always preserved.
        </p>
      </div>
      )}

      {isEditor && (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Load demo */}
        <Card>
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-brand-50 p-3 text-brand-600 dark:bg-brand-900/30"><Sparkles size={22} /></div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 dark:text-white">Load Demo Data</h3>
              <p className="mt-1 text-sm text-slate-500">
                Replaces current data with a realistic showcase: clients, vendors, employees, projects,
                invoices, payments, receipts and a quotation — so every feature has live data to demo.
              </p>
              <button className="btn-primary mt-4" onClick={() => setConfirm('demo')} disabled={!!busy}>
                {busy === 'demo' ? <Loader2 className="animate-spin" size={16} /> : <DatabaseZap size={16} />} Load Demo Data
              </button>
            </div>
          </div>
        </Card>

        {/* Clear all */}
        <Card>
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-red-50 p-3 text-red-600 dark:bg-red-900/30"><Trash2 size={22} /></div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 dark:text-white">Clear All Data</h3>
              <p className="mt-1 text-sm text-slate-500">
                Permanently wipes every payment, receipt, invoice, ledger entry, vendor, client, employee,
                project, statement and quote. Use this when you're ready to go live with real data.
              </p>
              <button className="btn-danger mt-4" onClick={() => setConfirm('clear')} disabled={!!busy}>
                {busy === 'clear' ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} Clear All Data
              </button>
            </div>
          </div>
        </Card>
      </div>
      )}

      {/* Publish to Cloud — available to all users (operator publishes their entries) */}
      <Card className="mt-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-900/30"><CloudUpload size={22} /></div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900 dark:text-white">Publish to Cloud</h3>
            <p className="mt-1 text-sm text-slate-500">
              Pushes your <strong>local data</strong> to the cloud so the admin can review everything on the web.
              Uploaded files (proofs, statements) stay on this computer — only the data is published, keeping the
              cloud fast and light. Run this after you've finished entering data.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={publish} disabled={busy === 'publish' || cloud?.configured === false}>
                {busy === 'publish' ? <Loader2 className="animate-spin" size={16} /> : <CloudUpload size={16} />} Publish to Cloud Now
              </button>
              <button className="btn-ghost" onClick={exportData} disabled={busy === 'export'}>
                {busy === 'export' ? <Loader2 className="animate-spin" size={16} /> : <DatabaseZap size={16} />} Download All Data (JSON)
              </button>
              {cloud && (
                <span className={`text-xs font-medium ${cloud.configured ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {cloud.configured ? '● Cloud target configured' : '● Set CLOUD_DATABASE_URL in server/.env to enable'}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Auto-publish keeps the cloud current after every change and on sign-out. “Download All Data” saves the entire database — every record shown anywhere in the app — as one lightweight JSON file (no images/attachments), the same data that goes to the cloud.
            </p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Or run from the command prompt</p>
            <div className="mt-1 flex items-center gap-2">
              <pre className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">{SYNC_COMMAND}</pre>
              <button className="btn-ghost !px-2.5" onClick={copyCmd} title="Copy command">
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              (One-time setup: <code>$env:CLOUD_DATABASE_URL="…your Neon URL…"</code> before <code>npm run sync</code>, or add it to <code>server/.env</code>.)
            </p>
          </div>
        </div>
      </Card>

      {/* Confirmation modal */}
      <Modal
        open={!!confirm}
        onClose={() => { setConfirm(null); setTyped(''); }}
        title={confirm === 'demo' ? 'Load demo data?' : 'Clear all data?'}
        size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => { setConfirm(null); setTyped(''); }}>Cancel</button>
            {confirm === 'demo' ? (
              <button className="btn-primary" onClick={() => run('demo')} disabled={busy === 'demo'}>
                {busy === 'demo' ? <Loader2 className="animate-spin" size={16} /> : 'Load Demo Data'}
              </button>
            ) : (
              <button className="btn-danger" onClick={() => run('clear')} disabled={typed !== 'CLEAR' || busy === 'clear'}>
                {busy === 'clear' ? <Loader2 className="animate-spin" size={16} /> : 'Permanently Clear'}
              </button>
            )}
          </>
        }
      >
        {confirm === 'demo' ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This will <strong>replace all current data</strong> with the demo dataset. User accounts stay intact. Continue?
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This permanently deletes <strong>all operational data</strong> in the portal. This cannot be undone.
            </p>
            <p className="text-sm text-slate-500">Type <strong>CLEAR</strong> to confirm:</p>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} placeholder="CLEAR" />
          </div>
        )}
      </Modal>
    </div>
  );
}
