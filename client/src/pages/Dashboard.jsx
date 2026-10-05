import {
  ArrowUpRight, ArrowDownLeft, Wallet, FileWarning, Banknote, FolderKanban,
  TrendingUp, AlertTriangle, FileCheck2, Truck, Clock, XCircle, ShieldCheck,
  DatabaseZap, DatabaseBackup, Building2, Building, FileText, ClipboardList, HardDrive, RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { Link } from 'react-router-dom';
import { Card, PageHeader, Loading, Badge } from '../components/ui/index.jsx';
import { useFetch } from '../lib/useFetch.js';
import { inr, fmtDate, titleCase } from '../lib/format.js';

const PIE_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#65a30d'];

function StatCard({ icon: Icon, label, value, tone = 'brand', to, sub }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
  };
  const inner = (
    <Card className="transition hover:shadow-soft">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${tones[tone]}`}>
          <Icon size={20} />
        </div>
      </div>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const { data: summary, loading } = useFetch('/dashboard/summary');
  const { data: cashflow } = useFetch('/dashboard/cashflow?months=6');
  const { data: byCategory } = useFetch('/dashboard/expense-by-category');
  const { data: byProject } = useFetch('/dashboard/expense-by-project');
  const { data: recent } = useFetch('/dashboard/recent');
  const { data: vendorSpend } = useFetch('/dashboard/vendor-spend');
  const { data: aging } = useFetch('/dashboard/receivable-aging');
  const { data: clientRevenue } = useFetch('/dashboard/client-revenue');
  const { data: sys } = useFetch('/dashboard/system-counters');
  const { data: gst } = useFetch('/dashboard/gst');

  if (loading) return <Loading label="Loading dashboard…" />;
  const s = summary || {};
  const g = gst || {};

  return (
    <div>
      <PageHeader
        title="Financial Data AIPL"
        subtitle="Real-time visibility across payments, receipts, receivables and reconciliation."
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ArrowUpRight} label="Total Outgoing" value={inr(s.total_outgoing, { compact: true })} tone="red" to="/payments" />
        <StatCard icon={ArrowDownLeft} label="Total Incoming" value={inr(s.total_incoming, { compact: true })} tone="green" to="/receipts" />
        <StatCard icon={Wallet} label="Pending Receivables" value={inr(s.pending_receivables, { compact: true })} tone="amber" to="/clients" />
        <StatCard icon={TrendingUp} label="Net Position" value={inr(s.net_position, { compact: true })} tone={s.net_position >= 0 ? 'green' : 'red'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FileWarning} label="Pending Invoices" value={s.pending_invoices ?? 0} tone="purple" to="/invoices" />
        <StatCard icon={AlertTriangle} label="Invoice-Pending Payments" value={s.invoice_pending_payments ?? 0} tone="amber" to="/payments" />
        <StatCard icon={Banknote} label="Reconciliation Pending" value={s.reconciliation_pending ?? 0} tone="red" to="/reconciliation" />
        <StatCard icon={FolderKanban} label="Active Projects" value={s.active_projects ?? 0} tone="brand" to="/projects" />
      </div>

      {/* §11 Production & data counters */}
      <div className="mb-2 mt-8 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          <DatabaseZap size={15} /> Production & Data
        </h2>
        {sys?.lastBackup && <span className="text-xs text-slate-400">Last backup {fmtDate(sys.lastBackup)}{sys.backupHealth != null ? ` · health ${sys.backupHealth}/100` : ''}</span>}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Building2} label="Vendors" value={sys?.vendors ?? '—'} tone="brand" to="/vendors" />
        <StatCard icon={Building} label="Offices (GSTINs)" value={sys?.offices ?? '—'} tone="purple" to="/gst/branches" />
        <StatCard icon={FileText} label="Invoices" value={sys?.invoices ?? '—'} tone="brand" to="/invoices" />
        <StatCard icon={FileCheck2} label="E-Invoices" value={sys?.einvoices ?? '—'} tone="green" to="/gst/compliance" />
        <StatCard icon={ClipboardList} label="Delivery Challans" value={sys?.challans ?? '—'} tone="amber" to="/challans" />
        <StatCard icon={Truck} label="E-Way Bills" value={sys?.ewbs ?? '—'} tone="purple" to="/gst/compliance" />
        <StatCard icon={DatabaseBackup} label="Last Backup" value={sys?.lastBackup ? fmtDate(sys.lastBackup) : '—'} tone={sys?.backupHealth >= 80 ? 'green' : sys?.backupHealth >= 50 ? 'amber' : 'red'} sub={sys?.backupHealth != null ? `Health ${sys.backupHealth}/100` : 'No backup yet'} to="/gst/backup" />
        <StatCard icon={HardDrive} label="Storage Used" value={sys ? `${(sys.storageBytes / 1048576).toFixed(0)} MB` : '—'} tone="brand" />
        <StatCard icon={RefreshCw} label="Last Cloud Sync" value={sys?.lastCloudSync ? fmtDate(sys.lastCloudSync) : 'Never'} tone="amber" to="/system" />
      </div>

      {/* GST e-Invoicing summary */}
      <div className="mb-2 mt-8 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          <ShieldCheck size={15} /> GST e-Invoicing
        </h2>
        <Link to="/gst/compliance" className="text-sm font-medium text-brand-600 hover:underline">Open e-Invoice workspace →</Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={FileCheck2} label="IRNs Today" value={g.todayIrns ?? 0} tone="green" to="/gst/compliance" />
        <StatCard icon={Truck} label="Active e-Way Bills" value={g.activeEwbs ?? 0} tone="brand" to="/gst/compliance" />
        <StatCard icon={Clock} label="EWB Expiring (24h)" value={g.expiringEwbs ?? 0} tone="amber" to="/gst/compliance" />
        <StatCard icon={AlertTriangle} label="Needs Review" value={g.complianceAlerts ?? 0} tone="amber" to="/gst/compliance" />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Monthly Cashflow</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={cashflow || []}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tickFormatter={(v) => inr(v, { compact: true })} tick={{ fontSize: 12, fill: '#94a3b8' }} width={70} />
              <Tooltip formatter={(v) => inr(v)} />
              <Legend />
              <Area type="monotone" dataKey="incoming" name="Incoming" stroke="#059669" fill="url(#gIn)" strokeWidth={2} />
              <Area type="monotone" dataKey="outgoing" name="Outgoing" stroke="#dc2626" fill="url(#gOut)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Expense by Category</h3>
          {byCategory?.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={byCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => inr(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">No expense data yet</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Project Expenditure vs Budget</h3>
          {byProject?.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byProject}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" vertical={false} />
                <XAxis dataKey="project" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tickFormatter={(v) => inr(v, { compact: true })} tick={{ fontSize: 12, fill: '#94a3b8' }} width={70} />
                <Tooltip formatter={(v) => inr(v)} />
                <Legend />
                <Bar dataKey="budget" name="Budget" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" name="Spent" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="received" name="Received" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">No project data yet</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Recent Transactions</h3>
          <div className="space-y-3">
            {recent?.length ? (
              recent.map((t) => (
                <div key={`${t.kind}-${t.id}`} className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${t.kind === 'payment' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                    {t.kind === 'payment' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{t.party || t.note || titleCase(t.kind)}</p>
                    <p className="text-xs text-slate-400">{fmtDate(t.date)}</p>
                  </div>
                  <span className={`text-sm font-semibold ${t.kind === 'payment' ? 'text-red-600' : 'text-emerald-600'}`}>
                    {t.kind === 'payment' ? '−' : '+'}{inr(t.amount, { compact: true })}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">No transactions yet</p>
            )}
          </div>
        </Card>
      </div>

      {/* Deeper analytics */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Top Vendors by Spend</h3>
          <div className="space-y-3">
            {vendorSpend?.length ? vendorSpend.map((v) => (
              <div key={v.vendor}>
                <div className="flex justify-between text-sm">
                  <span className="truncate text-slate-600 dark:text-slate-300">{v.vendor}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{inr(v.total_spent, { compact: true })}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (v.total_spent / vendorSpend[0].total_spent) * 100)}%` }} />
                </div>
              </div>
            )) : <p className="py-10 text-center text-sm text-slate-400">No vendor spend yet</p>}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Receivable Aging</h3>
          {aging?.some((a) => a.amount > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={aging} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => inr(v, { compact: true })} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="bucket" tick={{ fontSize: 11, fill: '#94a3b8' }} width={80} />
                <Tooltip formatter={(v) => inr(v)} />
                <Bar dataKey="amount" name="Outstanding" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-sm text-slate-400">No outstanding receivables</p>}
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Client-wise Revenue</h3>
          {clientRevenue?.some((c) => c.received > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={clientRevenue}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" vertical={false} />
                <XAxis dataKey="client" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tickFormatter={(v) => inr(v, { compact: true })} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} />
                <Tooltip formatter={(v) => inr(v)} />
                <Bar dataKey="received" name="Received" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-sm text-slate-400">No client revenue yet</p>}
        </Card>
      </div>
    </div>
  );
}
