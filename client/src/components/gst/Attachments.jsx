import { useRef, useState } from 'react';
import { Paperclip, Upload, Download, Trash2, Loader2, Lock } from 'lucide-react';
import { api, apiError } from '../../api/client.js';
import { useFetch } from '../../lib/useFetch.js';
import { useToast } from '../ui/Toast.jsx';
import { gstDownload, dmyt } from '../../lib/gst.js';

const CATEGORIES = ['PO', 'Delivery Challan', 'Transport Receipt', 'LR/GR', 'POD', 'Customer Approval', 'Signed PDF', 'Correspondence', 'Audit', 'Other'];

export default function Attachments({ objectType, objectId, canUpload = true, canDelete = true }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [category, setCategory] = useState('Other');
  const [immutable, setImmutable] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: items, refetch } = useFetch(`/gst/attachments?objectType=${objectType}&objectId=${objectId}`, [objectType, objectId]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('objectType', objectType); fd.append('objectId', objectId);
      fd.append('category', category); fd.append('immutable', immutable ? 'true' : 'false');
      await api.post('/gst/attachments', fd);
      toast.success('Attached'); refetch();
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const del = async (id) => { if (!window.confirm('Delete this attachment?')) return; try { await api.delete(`/gst/attachments/${id}`); refetch(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div className="mt-5">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><Paperclip size={14} /> Attachments {items?.length ? `(${items.length})` : ''}</h4>
      {canUpload && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 p-2 dark:border-slate-700">
          <select className="input !py-1.5 max-w-[150px] text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={immutable} onChange={(e) => setImmutable(e.target.checked)} /> Compliance-critical (lock)</label>
          <label className="btn-ghost !py-1.5 !text-sm cursor-pointer">{busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload<input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf,.xlsx,.xls,.csv" onChange={onFile} disabled={busy} /></label>
        </div>
      )}
      {!items?.length ? <p className="text-xs text-slate-400">No documents attached yet.</p> : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-1.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-700 dark:text-slate-200">{a.original_name} {a.is_immutable && <Lock size={11} className="inline text-amber-500" />}</p>
                <p className="text-xs text-slate-400">{a.category} • {(a.size_bytes / 1024).toFixed(0)} KB • {a.uploaded_by_name || '—'} • {dmyt(a.created_at)} • {a.download_count} downloads</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => gstDownload(`/gst/attachments/${a.id}/download`, a.original_name)}><Download size={12} /></button>
                {canDelete && !a.is_immutable && <button className="btn-ghost !py-1 !px-2 !text-xs text-red-500" onClick={() => del(a.id)}><Trash2 size={12} /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
