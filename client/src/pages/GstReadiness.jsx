import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, FileDown, ClipboardCheck } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { Card, PageHeader, Loading, Badge } from '../components/ui/index.jsx';
import { dmyt, gstDownload } from '../lib/gst.js';

const ICON = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle };
const TONE = { pass: 'green', warn: 'amber', fail: 'red' };

export default function GstReadiness() {
  const { data, loading, refetch } = useFetch('/gst/readiness');
  if (loading || !data) return <Loading label="Reviewing production readiness…" />;
  const verdictTone = data.summary.failed ? 'red' : data.summary.warnings ? 'amber' : 'green';

  return (
    <div>
      <PageHeader title="Production Readiness Review" subtitle="A full pre-deployment assessment across security, data, backup, compliance and operations."
        actions={<>
          <button className="btn-ghost" onClick={refetch}><RefreshCw size={16} /> Re-run</button>
          <button className="btn-ghost" onClick={() => gstDownload('/gst/readiness?format=csv', 'readiness.csv')}><FileDown size={16} /> Export</button>
        </>} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ClipboardCheck size={28} className={verdictTone === 'green' ? 'text-emerald-500' : verdictTone === 'amber' ? 'text-amber-500' : 'text-red-500'} />
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{data.summary.verdict}</p>
              <p className="text-xs text-slate-400">Generated {dmyt(data.generatedAt)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge tone="green">{data.summary.passed} passed</Badge>
            <Badge tone="amber">{data.summary.warnings} warnings</Badge>
            <Badge tone="red">{data.summary.failed} failed</Badge>
          </div>
        </div>
      </Card>

      <Card className="!p-0">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.checks.map((c) => {
            const Ic = ICON[c.status] || AlertTriangle;
            return (
              <li key={c.area} className="flex items-start gap-3 px-4 py-3">
                <Ic size={18} className={`mt-0.5 ${c.status === 'pass' ? 'text-emerald-500' : c.status === 'warn' ? 'text-amber-500' : 'text-red-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{c.area}</p>
                  <p className="text-xs text-slate-500">{c.detail}</p>
                  {c.recommendation && <p className="mt-0.5 text-xs text-amber-600">→ {c.recommendation}</p>}
                </div>
                <Badge tone={TONE[c.status]}>{c.status}</Badge>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
