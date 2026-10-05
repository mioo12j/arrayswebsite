import { useState } from 'react';
import { Search, FileDown, ScrollText, ShieldCheck, Download, Server } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { Card, PageHeader, Loading, Badge } from '../components/ui/index.jsx';
import { dmyt, gstDownload } from '../lib/gst.js';

const SRC = { audit: { tone: 'blue', icon: ScrollText }, access: { tone: 'slate', icon: Download }, api: { tone: 'purple', icon: Server } };

export default function GstActivity() {
  const [f, setF] = useState({ search: '', source: '', objectType: '', from: '', to: '' });
  const qs = new URLSearchParams(Object.fromEntries(Object.entries({ ...f, limit: 400 }).filter(([, v]) => v))).toString();
  const { data, loading } = useFetch(`/gst/activity?${qs}`, [qs]);

  return (
    <div>
      <PageHeader
        title="Activity Timeline"
        subtitle="Everything that happened across the GST module — creation, validation, submission, IRN, EWB, downloads, exports, cancellations."
        actions={<button className="btn-ghost" onClick={() => gstDownload(`/gst/activity/export?format=xlsx&${qs}`, 'activity.xlsx')}><FileDown size={16} /> Export</button>}
      />
      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search action or detail…" value={f.search} onChange={(e) => setF((x) => ({ ...x, search: e.target.value }))} />
          </div>
          <select className="input max-w-[150px]" value={f.source} onChange={(e) => setF((x) => ({ ...x, source: e.target.value }))}>
            <option value="">Any source</option>
            <option value="audit">Audit events</option>
            <option value="access">Access / downloads</option>
            <option value="api">API calls</option>
          </select>
          <select className="input max-w-[150px]" value={f.objectType} onChange={(e) => setF((x) => ({ ...x, objectType: e.target.value }))}>
            <option value="">Any object</option>
            <option value="einvoice">e-Invoice</option>
            <option value="ewb">e-Way Bill</option>
          </select>
          <input className="input max-w-[150px]" type="date" value={f.from} onChange={(e) => setF((x) => ({ ...x, from: e.target.value }))} title="From" />
          <input className="input max-w-[150px]" type="date" value={f.to} onChange={(e) => setF((x) => ({ ...x, to: e.target.value }))} title="To" />
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : !data?.length ? (
          <p className="py-12 text-center text-sm text-slate-400">No activity matches these filters.</p>
        ) : (
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((r, i) => {
              const cfg = SRC[r.source] || SRC.audit;
              const Icon = cfg.icon;
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.tone === 'purple' ? 'bg-purple-100 text-purple-600' : cfg.tone === 'blue' ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-500'}`}><Icon size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-700 dark:text-slate-200"><span className="font-semibold capitalize">{(r.action || '').replace(/_/g, ' ')}</span> {r.detail && <span className="text-slate-500">— {r.detail}</span>}</p>
                    <p className="text-xs text-slate-400">{dmyt(r.ts)} {r.actor ? `• ${r.actor}` : ''} {r.object_type ? `• ${r.object_type}` : ''}</p>
                  </div>
                  <Badge tone={cfg.tone}>{r.source}</Badge>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
