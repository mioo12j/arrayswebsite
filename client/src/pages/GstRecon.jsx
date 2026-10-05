import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Info, Check, EyeOff, FileDown, RefreshCw, ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Loading, Badge } from '../components/ui/index.jsx';
import { gstDownload } from '../lib/gst.js';

const SEV = {
  critical: { tone: 'red', icon: AlertOctagon, dot: 'bg-red-500' },
  warning: { tone: 'amber', icon: AlertTriangle, dot: 'bg-amber-500' },
  info: { tone: 'blue', icon: Info, dot: 'bg-brand-500' },
};
const srcLink = (objectType) => objectType === 'invoice' ? '/invoices' : '/gst/compliance';

export default function GstRecon() {
  const toast = useToast();
  const { data, loading, refetch } = useFetch('/gst/recon');
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState('');

  const resolve = async (g, it, status) => {
    const note = status === 'overridden' ? window.prompt('Override reason (required):') : (status === 'ignored' ? 'Marked not applicable' : 'Resolved');
    if (status === 'overridden' && !note) return;
    setBusy(it.objectId + status);
    try {
      await api.post('/gst/recon/resolve', { checkKey: g.key, objectType: it.objectType, objectId: it.objectId, status, note });
      toast.success('Discrepancy updated'); refetch();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };

  if (loading || !data) return <Loading label="Reconciling compliance layers…" />;
  const s = data.summary;
  const active = data.groups.filter((g) => g.openCount > 0);

  return (
    <div>
      <PageHeader
        title="GST Reconciliation Center"
        subtitle="Live control room — mismatches between internal invoices, e-Invoices and e-Way Bills."
        actions={<>
          <button className="btn-ghost" onClick={refetch}><RefreshCw size={16} /> Re-run</button>
          <button className="btn-ghost" onClick={() => gstDownload('/gst/recon/export?format=xlsx', 'reconciliation.xlsx')}><FileDown size={16} /> Export</button>
        </>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open Discrepancies" value={s.totalOpen} tone="text-slate-800" />
        <Stat label="Critical" value={s.critical} tone="text-red-600" />
        <Stat label="Warnings" value={s.warning} tone="text-amber-600" />
        <Stat label="Checks Run" value={s.checks} tone="text-brand-600" />
      </div>

      {active.length === 0 ? (
        <Card><div className="flex flex-col items-center gap-2 py-12 text-center"><Check className="text-emerald-500" size={32} /><p className="font-semibold text-slate-700 dark:text-slate-200">All clear — no open discrepancies.</p><p className="text-sm text-slate-400">Every compliance layer reconciles.</p></div></Card>
      ) : (
        <div className="space-y-3">
          {active.map((g) => {
            const cfg = SEV[g.severity] || SEV.info;
            const Icon = cfg.icon;
            const isOpen = open[g.key] ?? (g.severity === 'critical');
            return (
              <Card key={g.key} className="!p-0">
                <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))}>
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${cfg.tone === 'red' ? 'bg-red-100 text-red-600' : cfg.tone === 'amber' ? 'bg-amber-100 text-amber-600' : 'bg-brand-100 text-brand-600'}`}><Icon size={16} /></span>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{g.title}</p>
                      <p className="text-xs text-slate-400">{g.hint}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={cfg.tone}>{g.openCount} open</Badge>
                    {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {g.items.map((it) => (
                      <div key={it.objectId} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 px-4 py-2.5 last:border-0 dark:border-slate-800/50">
                        <div className="min-w-[200px]">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{it.ref || it.objectId.slice(0, 8)}</p>
                          <p className="text-xs text-slate-400">{it.detail}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Link to={srcLink(it.objectType)} className="btn-ghost !py-1 !px-2 !text-xs"><ExternalLink size={12} /> View</Link>
                          <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={!!busy} onClick={() => resolve(g, it, 'resolved')}>{busy === it.objectId + 'resolved' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Resolve</button>
                          <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={!!busy} onClick={() => resolve(g, it, 'ignored')}><EyeOff size={12} /> Ignore</button>
                          <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={!!busy} onClick={() => resolve(g, it, 'overridden')}>Override</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </Card>
  );
}
