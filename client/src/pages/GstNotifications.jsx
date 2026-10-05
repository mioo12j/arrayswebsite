import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Info, Bell, Check, Eye, RefreshCw, ExternalLink } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Loading, Badge } from '../components/ui/index.jsx';
import { dmyt } from '../lib/gst.js';

const SEV = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
const TONE = { critical: 'red', warning: 'amber', info: 'blue' };
const srcLink = (t) => t === 'invoice' ? '/invoices' : '/gst/compliance';

export default function GstNotifications() {
  const toast = useToast();
  const [filter, setFilter] = useState({ status: 'open', severity: '' });
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(filter).filter(([, v]) => v))).toString();
  const { data, loading, refetch } = useFetch(`/gst/notifications?${qs}`, [qs]);

  const setStatus = async (id, status) => {
    try { await api.post(`/gst/notifications/${id}/status`, { status }); refetch(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader
        title="Notification & Alert Center"
        subtitle="Proactive compliance alerts — every alert names what happened, where, and the action required."
        actions={<button className="btn-ghost" onClick={() => api.post('/gst/notifications/refresh').then(refetch)}><RefreshCw size={16} /> Refresh</button>}
      />
      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap gap-2">
          <select className="input max-w-[160px]" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
            <option value="open">Open (active)</option>
            <option value="unread">Unread</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="">All</option>
          </select>
          <select className="input max-w-[150px]" value={filter.severity} onChange={(e) => setFilter((f) => ({ ...f, severity: e.target.value }))}>
            <option value="">Any severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
      </Card>

      {loading ? <Loading /> : !data?.length ? (
        <Card><div className="flex flex-col items-center gap-2 py-12 text-center"><Bell className="text-emerald-500" size={32} /><p className="font-semibold text-slate-700 dark:text-slate-200">No alerts here.</p><p className="text-sm text-slate-400">You're all caught up.</p></div></Card>
      ) : (
        <div className="space-y-2">
          {data.map((n) => {
            const Icon = SEV[n.severity] || Info;
            const tone = TONE[n.severity] || 'blue';
            return (
              <Card key={n.id} className={`!p-3 ${n.status === 'unread' ? 'border-l-4 border-l-brand-500' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone === 'red' ? 'bg-red-100 text-red-600' : tone === 'amber' ? 'bg-amber-100 text-amber-600' : 'bg-brand-100 text-brand-600'}`}><Icon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{n.title}</p>
                      <Badge tone={tone}>{n.severity}</Badge>
                      {n.status !== 'unread' && <Badge tone="slate">{n.status}</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{n.description}</p>
                    {n.suggested_action && <p className="mt-1 text-xs text-brand-600">→ {n.suggested_action}</p>}
                    <p className="mt-1 text-xs text-slate-400">{dmyt(n.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {n.object_id && <Link to={srcLink(n.object_type)} className="btn-ghost !py-1 !px-2 !text-xs"><ExternalLink size={12} /> View</Link>}
                    {n.status !== 'resolved' && <>
                      {n.status === 'unread' && <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setStatus(n.id, 'read')}><Eye size={12} /> Read</button>}
                      <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setStatus(n.id, 'acknowledged')}>Ack</button>
                      <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setStatus(n.id, 'resolved')}><Check size={12} /> Resolve</button>
                    </>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
