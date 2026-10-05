import { useState } from 'react';
import { History, GitCompare, RotateCcw, FileDown, Loader2 } from 'lucide-react';
import { api, apiError } from '../../api/client.js';
import { useFetch } from '../../lib/useFetch.js';
import { useToast } from '../ui/Toast.jsx';
import { dmyt, gstDownload } from '../../lib/gst.js';

export default function VersionHistory({ objectType, objectId, canRestore, locked, restorePath, onRestored }) {
  const toast = useToast();
  const { data: rows, loading } = useFetch(`/gst/versions/${objectType}/${objectId}`, [objectType, objectId]);
  const [sel, setSel] = useState([]);
  const [diff, setDiff] = useState(null);
  const [busy, setBusy] = useState('');

  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2));
  const compare = async () => {
    if (sel.length !== 2) return;
    try { const { data } = await api.get(`/gst/versions/compare?a=${sel[0]}&b=${sel[1]}`); setDiff(data); }
    catch (e) { toast.error(apiError(e)); }
  };
  const restore = async (versionId) => {
    if (!window.confirm('Restore this version’s content? A new version will be recorded.')) return;
    setBusy(versionId);
    try { await api.post(restorePath, { versionId }); toast.success('Version restored'); onRestored?.(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };

  if (loading) return <p className="text-xs text-slate-400">Loading versions…</p>;
  if (!rows?.length) return <p className="text-xs text-slate-400">No version history yet.</p>;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={sel.length !== 2} onClick={compare}><GitCompare size={12} /> Compare</button>
        <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => gstDownload(`/gst/versions/${objectType}/${objectId}/pdf`, 'version-history.pdf')}><FileDown size={12} /> Export PDF</button>
        {locked && <span className="text-xs text-amber-600">Locked — versions are view-only after IRN/EWB.</span>}
      </div>
      <ol className="space-y-1.5">
        {rows.map((v) => (
          <li key={v.id} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
            <input type="checkbox" className="mt-1" checked={sel.includes(v.id)} onChange={() => toggle(v.id)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">v{v.version_no} <span className="text-xs font-normal text-slate-400">· {v.status_at}</span></p>
              <p className="text-xs text-slate-500">{v.change_summary}{v.change_reason ? ` — ${v.change_reason}` : ''}</p>
              <p className="text-xs text-slate-400">{dmyt(v.created_at)} · {v.user_name || '—'}</p>
            </div>
            {canRestore && !locked && v.version_no !== rows[0].version_no && (
              <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={busy === v.id} onClick={() => restore(v.id)}>{busy === v.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}</button>
            )}
          </li>
        ))}
      </ol>
      {diff && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
          <p className="mb-1 font-semibold">v{diff.a.versionNo} ↔ v{diff.b.versionNo} — {diff.diffs.length} change(s)</p>
          {diff.diffs.map((d) => (
            <div key={d.field} className="border-t border-slate-200 py-1 dark:border-slate-700">
              <span className="font-mono text-slate-500">{d.field}</span>
              <div className="text-red-500 line-through break-all">{JSON.stringify(d.a)?.slice(0, 80)}</div>
              <div className="text-emerald-600 break-all">{JSON.stringify(d.b)?.slice(0, 80)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
