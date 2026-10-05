import { useState } from 'react';
import { Bookmark, Star, Plus, Trash2, Users, Building } from 'lucide-react';
import { api, apiError } from '../../api/client.js';
import { useFetch } from '../../lib/useFetch.js';
import { useToast } from '../ui/Toast.jsx';

const SCOPE_ICON = { private: Bookmark, team: Users, company: Building };

export default function SavedViews({ objectType, filters, onApply }) {
  const toast = useToast();
  const { data: views, refetch } = useFetch(`/gst/views?objectType=${objectType}`, [objectType]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const name = window.prompt('Name this view:'); if (!name) return;
    const scope = window.confirm('Share with the whole team/company? OK = team, Cancel = private') ? 'team' : 'private';
    setBusy(true);
    try { await api.post('/gst/views', { name, objectType, filters, scope }); toast.success('View saved'); refetch(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const del = async (id) => { if (!window.confirm('Delete this view?')) return; try { await api.delete(`/gst/views/${id}`); refetch(); } catch (e) { toast.error(apiError(e)); } };
  const pin = async (v) => { try { await api.patch(`/gst/views/${v.id}`, { isPinned: !v.is_pinned }); refetch(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
      <span className="text-xs font-semibold uppercase text-slate-400">Views:</span>
      {(views || []).map((v) => {
        const Ic = SCOPE_ICON[v.scope] || Bookmark;
        return (
          <span key={v.id} className="group inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs dark:bg-slate-800">
            <button className="flex items-center gap-1 font-medium text-slate-600 hover:text-brand-600 dark:text-slate-300" onClick={() => onApply(v.filters || {})}>
              <Ic size={11} /> {v.name}{v.is_pinned && <Star size={10} className="text-amber-500" />}
            </button>
            {v.is_owner && <>
              <button className="text-slate-300 hover:text-amber-500" onClick={() => pin(v)} title="Pin"><Star size={11} /></button>
              <button className="text-slate-300 hover:text-red-500" onClick={() => del(v.id)} title="Delete"><Trash2 size={11} /></button>
            </>}
          </span>
        );
      })}
      <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-brand-300 dark:border-slate-700" onClick={save} disabled={busy}><Plus size={11} /> Save current</button>
    </div>
  );
}
