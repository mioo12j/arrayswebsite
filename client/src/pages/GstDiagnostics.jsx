import { useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw, FlaskConical, FileDown, Loader2 } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Loading, Badge } from '../components/ui/index.jsx';
import { dmyt, gstDownload } from '../lib/gst.js';

const ICON = { healthy: CheckCircle2, pass: CheckCircle2, warning: AlertTriangle, warn: AlertTriangle, failed: XCircle, fail: XCircle };
const TONE = { healthy: 'green', pass: 'green', warning: 'amber', warn: 'amber', failed: 'red', fail: 'red' };

export default function GstDiagnostics() {
  const toast = useToast();
  const { data, loading, refetch } = useFetch('/gst/diagnostics');
  const [tests, setTests] = useState(null);
  const [busy, setBusy] = useState(false);

  const runTests = async () => { setBusy(true); try { const { data } = await api.get('/gst/test-suite'); setTests(data); toast.success(`Tests: ${data.summary.pass} pass, ${data.summary.fail} fail`); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };

  if (loading || !data) return <Loading label="Running diagnostics…" />;

  return (
    <div>
      <PageHeader title="Health Check & Diagnostics" subtitle="Live status of every subsystem — is a failure internal, configuration, data, or portal?"
        actions={<>
          <button className="btn-ghost" onClick={refetch}><RefreshCw size={16} /> Re-check</button>
          <button className="btn-ghost" onClick={() => gstDownload('/gst/diagnostics?format=csv', 'diagnostics.csv')}><FileDown size={16} /> Export</button>
          <button className="btn-primary" onClick={runTests} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <FlaskConical size={16} />} Run Test Suite</button>
        </>} />

      <div className="mb-4 flex items-center gap-3">
        <Badge tone={TONE[data.summary.overall]}>{data.summary.overall.toUpperCase()}</Badge>
        <span className="text-sm text-slate-500">{data.summary.healthy} healthy · {data.summary.warning} warning · {data.summary.failed} failed · checked {dmyt(data.lastCheck)}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {data.checks.map((c) => {
          const Ic = ICON[c.status] || Activity;
          return (
            <Card key={c.label} className="!p-3">
              <div className="flex items-start gap-3">
                <Ic size={18} className={c.status === 'healthy' ? 'text-emerald-500' : c.status === 'warning' ? 'text-amber-500' : 'text-red-500'} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{c.label}</p>
                  <p className="text-xs text-slate-500">{c.detail}</p>
                  {c.recommendation && <p className="mt-0.5 text-xs text-amber-600">→ {c.recommendation}</p>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {tests && (
        <Card className="mt-5 !p-0">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold dark:border-slate-800">Soft-launch Test Suite — {tests.summary.pass} pass · {tests.summary.warn} warn · {tests.summary.fail} fail</div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tests.tests.map((t) => {
              const Ic = ICON[t.status] || Activity;
              return (
                <li key={t.name} className="flex items-center gap-3 px-4 py-2">
                  <Ic size={16} className={t.status === 'pass' ? 'text-emerald-500' : t.status === 'warn' ? 'text-amber-500' : 'text-red-500'} />
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{t.name}</span>
                  <span className="text-xs text-slate-400">{t.detail}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
