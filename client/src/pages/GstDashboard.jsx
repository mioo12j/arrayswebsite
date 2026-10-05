import { Link } from 'react-router-dom';
import {
  FileText, Truck, FileCheck2, FileClock, FileX2, AlertTriangle, IndianRupee,
  CheckCircle2, Timer, CalendarX2, Ban, PackageCheck, ArrowRight, FileMinus2,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { useFetch } from '../lib/useFetch.js';
import { useBranch } from '../context/BranchContext.jsx';
import { Card, PageHeader, Loading } from '../components/ui/index.jsx';
import PortalUploadButton from '../components/gst/PortalUpload.jsx';
import { inr } from '../lib/gst.js';

const COLORS = ['#1d4ed8', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

function Metric({ icon: Icon, label, value, sub, tone = 'text-slate-700', bg = 'bg-slate-100', to }) {
  const body = (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 truncate text-xl font-bold tabular-nums text-slate-900 dark:text-white" title={String(value ?? '')}>{value}</p>
          {sub}
        </div>
        <div className={`shrink-0 rounded-xl p-2.5 ${bg} ${tone}`}><Icon size={20} /></div>
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

// Two-part sub-line for the value metrics: IRN-filed vs not-yet-filed.
function FiledSplit({ filed, unfiled, money }) {
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] font-medium">
      <span className="text-emerald-600 dark:text-emerald-400" title="Invoices with an IRN generated">IRN filed {money(filed)}</span>
      <span className="text-amber-600 dark:text-amber-500" title="Non-cancelled invoices without an IRN yet (draft / validated / pending / error)">Not filed {money(unfiled)}</span>
    </p>
  );
}

// Tooltip for the Monthly Invoice Volume chart — shows not just the invoice
// count for the month but the taxable value and GST value raised in it.
function VolumeTooltip({ active, payload, money }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload || {};
  const row = (label, val, cls = 'text-slate-700 dark:text-slate-200') => (
    <div className="flex items-center justify-between gap-6"><span className="text-slate-500">{label}</span><span className={`font-semibold tabular-nums ${cls}`}>{val}</span></div>
  );
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">{d.month}</p>
      {row('Invoices', d.invoices)}
      {row('Taxable', money(d.taxableValue), 'text-brand-600 dark:text-brand-300')}
      {row('GST', money(d.gstValue), 'text-emerald-600 dark:text-emerald-400')}
    </div>
  );
}

export default function GstDashboard() {
  const { branchQS, activeBranch } = useBranch();
  const { data, loading } = useFetch(`/gst/dashboard${branchQS ? `?${branchQS}` : ''}`, [branchQS]);
  const { data: alerts } = useFetch('/gst/notifications/summary');
  const { data: recon } = useFetch('/gst/recon');
  if (loading || !data) return <Loading label="Loading GST dashboard…" />;
  const e = data.einvoice || {};
  const w = data.ewb || {};
  const c = data.charts || {};
  // Compact ₹ so large values never overflow the metric boxes.
  const money = (v) => {
    const n = Number(v || 0);
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return inr(n).replace('.00', '');
  };

  return (
    <div>
      <PageHeader
        title="GST Compliance Dashboard"
        subtitle={`e-Invoice (IRP) and e-Way Bill compliance${activeBranch ? ` — ${activeBranch.code} ${activeBranch.name}` : ' — all branches'}.`}
        actions={<div className="flex items-center gap-2"><PortalUploadButton kind="einvoice" compact /><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700" title="Offline filing — JSON is uploaded on the government portal">● Live</span></div>}
      />

      {/* Control-room strip: alerts + reconciliation */}
      {(Number(alerts?.open) > 0 || Number(recon?.summary?.totalOpen) > 0) && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link to="/gst/notifications" className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-900/10">
            <div className="flex items-center gap-3"><AlertTriangle className="text-amber-600" size={20} /><div><p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{alerts?.open || 0} active alert(s)</p><p className="text-xs text-amber-700">{alerts?.critical || 0} critical • {alerts?.warning || 0} warning</p></div></div>
            <ArrowRight size={16} className="text-amber-600" />
          </Link>
          <Link to="/gst/reconciliation" className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 transition hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-900/10">
            <div className="flex items-center gap-3"><FileX2 className="text-brand-600" size={20} /><div><p className="text-sm font-semibold text-brand-800 dark:text-brand-300">{recon?.summary?.totalOpen || 0} reconciliation discrepanc(ies)</p><p className="text-xs text-brand-700">{recon?.summary?.critical || 0} critical • across {recon?.summary?.checks || 0} checks</p></div></div>
            <ArrowRight size={16} className="text-brand-600" />
          </Link>
        </div>
      )}

      {/* e-Invoice metrics */}
      <h3 className="mb-2 text-sm font-semibold text-slate-500">e-Invoices</h3>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Metric icon={FileText} label="Total" value={e.total} to="/gst/compliance" />
        <Metric icon={FileClock} label="Draft" value={e.draft} tone="text-slate-600" bg="bg-slate-100" />
        <Metric icon={FileClock} label="Pending" value={e.pending_submission} tone="text-amber-600" bg="bg-amber-100" />
        <Metric icon={FileCheck2} label="IRN Generated" value={e.irn_generated} tone="text-emerald-600" bg="bg-emerald-100" />
        <Metric icon={FileX2} label="Cancelled" value={e.cancelled} tone="text-red-600" bg="bg-red-100" />
        <Metric icon={AlertTriangle} label="Failed Validation" value={e.failed_validation} tone="text-red-600" bg="bg-red-100" />
        <Metric icon={FileMinus2} label="Credit Notes" value={e.credit_notes} sub={Number(e.credit_note_val) > 0 ? <p className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-500">− {money(e.credit_note_val)} adjusted</p> : undefined} tone="text-amber-600" bg="bg-amber-100" to="/gst/compliance" />
        <Metric icon={IndianRupee} label="Taxable Value" value={money(e.total_taxable_val)} tone="text-brand-600" bg="bg-brand-100"
          sub={<FiledSplit filed={e.filed_taxable_val} unfiled={e.unfiled_taxable_val} money={money} />} />
        <Metric icon={IndianRupee} label="GST Value" value={money(e.total_tax_val)} tone="text-brand-600" bg="bg-brand-100"
          sub={<FiledSplit filed={e.filed_tax_val} unfiled={e.unfiled_tax_val} money={money} />} />
      </div>

      {/* EWB metrics */}
      <h3 className="mb-2 text-sm font-semibold text-slate-500">e-Way Bills</h3>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric icon={CheckCircle2} label="Active" value={w.active} tone="text-emerald-600" bg="bg-emerald-100" />
        <Metric icon={Timer} label="Expiring Soon" value={w.expiring_soon} tone="text-amber-600" bg="bg-amber-100" />
        <Metric icon={CalendarX2} label="Expired" value={w.expired} tone="text-red-600" bg="bg-red-100" />
        <Metric icon={Ban} label="Cancelled" value={w.cancelled} tone="text-red-600" bg="bg-red-100" />
        <Metric icon={PackageCheck} label="Closed" value={w.closed} tone="text-purple-600" bg="bg-purple-100" />
        <Metric icon={Truck} label="Part-B Pending" value={w.part_b_pending} tone="text-amber-600" bg="bg-amber-100" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Monthly Invoice Volume</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={c.monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} />
              <Tooltip content={<VolumeTooltip money={money} />} />
              <Bar dataKey="invoices" name="Invoices" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Monthly GST Collection</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={c.monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} tickFormatter={money} />
              <Tooltip formatter={(v) => inr(v)} /><Line type="monotone" dataKey="gstValue" stroke="#16a34a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">EWB Status Distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={c.ewbStatus || []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label>
                {(c.ewbStatus || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">State-wise Supply (by value)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={c.stateWise || []} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" fontSize={11} tickFormatter={money} />
              <YAxis type="category" dataKey="state" fontSize={10} width={90} />
              <Tooltip formatter={(v) => inr(v)} /><Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="mt-4 flex gap-3">
        <Link to="/gst/compliance" className="btn-primary">Open Compliance Workspace <ArrowRight size={16} /></Link>
        <Link to="/gst/reports" className="btn-ghost">Compliance Reports</Link>
      </div>
    </div>
  );
}
