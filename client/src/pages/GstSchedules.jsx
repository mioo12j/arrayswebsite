import { useState } from 'react';
import { Plus, Play, Trash2, Loader2, CalendarClock } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Loading, Table, Badge, Field } from '../components/ui/index.jsx';
import { dmyt } from '../lib/gst.js';

const REPORTS = [
  ['gst-summary', 'GST Summary'], ['hsn-summary', 'HSN Summary'], ['customer-tax', 'Customer-wise Tax'],
  ['state-tax', 'State-wise Tax'], ['irn-status', 'IRN Success/Failure'], ['ewb-validity', 'EWB Validity'],
  ['cancelled', 'Cancelled Documents'], ['audit', 'Audit Activity'],
];

export default function GstSchedules() {
  const toast = useToast();
  const { data: rows, loading, refetch } = useFetch('/gst/schedules');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ reportType: 'gst-summary', frequency: 'monthly', format: 'xlsx' });
  const [busy, setBusy] = useState('');

  const create = async () => { setBusy('create'); try { await api.post('/gst/schedules', f); toast.success('Schedule created'); setOpen(false); refetch(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); } };
  const runNow = async (id) => { setBusy(id); try { const { data } = await api.post(`/gst/schedules/${id}/run`); toast.success(`Generated (${data.row_count} rows)`); refetch(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); } };
  const del = async (id) => { if (!window.confirm('Remove this schedule?')) return; try { await api.delete(`/gst/schedules/${id}`); refetch(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div>
      <PageHeader title="Scheduled Reports" subtitle="Auto-generate compliance summaries on a daily, weekly or monthly cadence."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New Schedule</button>} />
      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table columns={[{ header: 'Report' }, { header: 'Frequency' }, { header: 'Format' }, { header: 'Runs' }, { header: 'Last Generated' }, { header: 'Next' }, { header: '' }]}
            rows={rows || []} empty="No scheduled reports yet."
            renderRow={(s) => (
              <>
                <td className="td font-medium">{REPORTS.find(([t]) => t === s.report_type)?.[1] || s.report_type}</td>
                <td className="td capitalize">{s.frequency}</td>
                <td className="td uppercase">{s.format}</td>
                <td className="td">{s.run_count}</td>
                <td className="td text-xs">{s.last_generated ? dmyt(s.last_generated) : '—'}</td>
                <td className="td text-xs">{s.next_run_at ? dmyt(s.next_run_at) : '—'}</td>
                <td className="td text-right">
                  <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={busy === s.id} onClick={() => runNow(s.id)}>{busy === s.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run</button>
                  <button className="btn-ghost !py-1 !px-2 !text-xs text-red-500" onClick={() => del(s.id)}><Trash2 size={12} /></button>
                </td>
              </>
            )} />
        )}
      </Card>
      <Card className="mt-4 !p-4"><p className="text-sm text-slate-500"><CalendarClock size={14} className="mr-1 inline" /> Runs happen when the app is open (it catches up on anything due). A scheduled OS task or <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npm run</code> job can also trigger generation for unattended operation. Email delivery is wired for a future phase.</p></Card>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">New Scheduled Report</h3>
            <div className="space-y-3">
              <Field label="Report"><select className="input" value={f.reportType} onChange={(e) => setF((x) => ({ ...x, reportType: e.target.value }))}>{REPORTS.map(([t, l]) => <option key={t} value={t}>{l}</option>)}</select></Field>
              <Field label="Frequency"><select className="input" value={f.frequency} onChange={(e) => setF((x) => ({ ...x, frequency: e.target.value }))}>{['daily', 'weekly', 'monthly'].map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
              <Field label="Format"><select className="input" value={f.format} onChange={(e) => setF((x) => ({ ...x, format: e.target.value }))}>{['xlsx', 'csv'].map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={create} disabled={busy === 'create'}>{busy === 'create' ? <Loader2 className="animate-spin" size={16} /> : 'Create'}</button></div>
          </Card>
        </div>
      )}
    </div>
  );
}
