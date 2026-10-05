import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Activity, CheckCircle2, XCircle, Server, Clock, RefreshCw } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { Card, PageHeader, Loading, Badge } from '../components/ui/index.jsx';
import { dmyt } from '../lib/gst.js';

const connTone = (s) => s === 'Connected' ? 'green' : s === 'Degraded' ? 'red' : s === 'Simulated' ? 'amber' : 'slate';

export default function GstHealth() {
  const { data, loading, refetch } = useFetch('/gst/health');
  if (loading || !data) return <Loading label="Checking integration health…" />;

  return (
    <div>
      <PageHeader
        title="API Health & Monitoring"
        subtitle="Live health of the compliance integrations — is a failure internal, credential, config, or portal?"
        actions={<button className="btn-ghost" onClick={refetch}><RefreshCw size={16} /> Refresh</button>}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="!p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-slate-400">IRP (e-Invoice)</p><p className="mt-1 text-lg font-bold"><Badge tone={connTone(data.irpStatus)}>{data.irpStatus}</Badge></p></div><Server className="text-slate-300" size={22} /></div></Card>
        <Card className="!p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-slate-400">E-Way Bill</p><p className="mt-1 text-lg font-bold"><Badge tone={connTone(data.ewbStatus)}>{data.ewbStatus}</Badge></p></div><Server className="text-slate-300" size={22} /></div></Card>
        <Card className="!p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-slate-400">Adapter Mode</p><p className="mt-1 text-lg font-bold capitalize">{data.mode}</p></div><Activity className="text-slate-300" size={22} /></div></Card>
        <Card className="!p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-slate-400">Success Ratio</p><p className="mt-1 text-2xl font-bold text-emerald-600">{data.successRatio}%</p></div><CheckCircle2 className="text-emerald-200" size={22} /></div></Card>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini icon={Activity} label="Total Calls" value={data.totalCalls} />
        <Mini icon={CheckCircle2} label="Accepted" value={data.accepted} tone="text-emerald-600" />
        <Mini icon={XCircle} label="Rejected" value={data.rejected} tone="text-red-600" />
        <Mini icon={Clock} label="Avg Response" value={`${data.avgMs} ms`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Response & Failure Trend (14 days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="calls" stroke="#1d4ed8" strokeWidth={2} name="Calls" />
              <Line type="monotone" dataKey="failures" stroke="#dc2626" strokeWidth={2} name="Failures" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Status & Timing</h3>
          <dl className="space-y-2 text-sm">
            <Row k="Last successful submission" v={data.lastSuccess ? dmyt(data.lastSuccess) : '—'} />
            <Row k="Last failed submission" v={data.lastFailure ? dmyt(data.lastFailure) : '—'} />
            <Row k="Pending e-invoice submissions" v={data.pendingSubmissions.einvoice} />
            <Row k="Pending EWB generations" v={data.pendingSubmissions.ewb} />
            <Row k="Unknown responses" v={data.unknown} />
          </dl>
          <h4 className="mb-2 mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">By action</h4>
          <div className="space-y-1 text-sm">
            {data.byAction.map((a) => <div key={a.action} className="flex justify-between"><span className="text-slate-500">{a.action}</span><span>{a.ok}✓ / {a.failed}✗ • {a.avg_ms || 0}ms</span></div>)}
          </div>
        </Card>
      </div>

      {data.errorDistribution.length > 0 && (
        <Card className="mt-4">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Portal Error Distribution</h3>
          <div className="space-y-1 text-sm">
            {data.errorDistribution.map((e) => <div key={e.error_code} className="flex justify-between"><span className="font-mono text-slate-600">{e.error_code}</span><span className="font-semibold">{e.count}</span></div>)}
          </div>
        </Card>
      )}
    </div>
  );
}

function Mini({ icon: Icon, label, value, tone = 'text-slate-800' }) {
  return <Card className="!p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className={`mt-1 text-xl font-bold ${tone} dark:text-white`}>{value}</p></div><Icon className="text-slate-300" size={20} /></div></Card>;
}
function Row({ k, v }) {
  return <div className="flex justify-between border-b border-slate-50 py-1 dark:border-slate-800/50"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{v}</dd></div>;
}
