import { useState } from 'react';
import { Send, Pin, Check, RotateCcw, MessageSquare, Loader2 } from 'lucide-react';
import { api, apiError } from '../../api/client.js';
import { useFetch } from '../../lib/useFetch.js';
import { useToast } from '../ui/Toast.jsx';
import { Badge } from '../ui/index.jsx';
import { dmyt } from '../../lib/gst.js';

const KIND_TONE = { internal: 'slate', approval: 'blue', audit: 'amber', system: 'purple' };

export default function Discussion({ objectType, objectId }) {
  const toast = useToast();
  const { data: rows, loading, refetch } = useFetch(`/gst/comments?objectType=${objectType}&objectId=${objectId}`, [objectType, objectId]);
  const [text, setText] = useState('');
  const [kind, setKind] = useState('internal');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await api.post('/gst/comments', { objectType, objectId, kind, content: text }); setText(''); refetch(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const act = async (fn) => { try { await fn(); refetch(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div>
      {loading ? <p className="text-xs text-slate-400">Loading…</p> : !rows?.length ? (
        <p className="mb-2 text-xs text-slate-400"><MessageSquare size={12} className="mr-1 inline" /> No discussion yet. Start the conversation below.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {rows.map((c) => (
            <li key={c.id} className={`rounded-lg border p-2 ${c.is_pinned ? 'border-amber-300 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-900/10' : 'border-slate-100 dark:border-slate-800'} ${c.parent_id ? 'ml-5' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{c.author_name || '—'}</span>
                <Badge tone={KIND_TONE[c.kind]}>{c.kind}</Badge>
                {c.is_resolved && <Badge tone="green">resolved</Badge>}
                <span className="ml-auto text-xs text-slate-400">{dmyt(c.created_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{c.content}</p>
              {c.mentions?.length > 0 && <p className="mt-0.5 text-xs text-brand-600">mentioned: {c.mentions.map((m) => m.name).join(', ')}</p>}
              <div className="mt-1 flex gap-1">
                <button className="btn-ghost !py-0.5 !px-1.5 !text-xs" onClick={() => act(() => api.post(`/gst/comments/${c.id}/pin`, { pinned: !c.is_pinned }))}><Pin size={11} /> {c.is_pinned ? 'Unpin' : 'Pin'}</button>
                <button className="btn-ghost !py-0.5 !px-1.5 !text-xs" onClick={() => act(() => api.post(`/gst/comments/${c.id}/resolve`, { resolved: !c.is_resolved }))}>{c.is_resolved ? <><RotateCcw size={11} /> Reopen</> : <><Check size={11} /> Resolve</>}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <select className="input !py-1.5 max-w-[120px] text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          {['internal', 'approval', 'audit', 'system'].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input className="input !py-1.5 flex-1 text-sm" placeholder="Add a note… use @name to mention" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn-primary !py-1.5" onClick={send} disabled={busy || !text.trim()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
      </div>
    </div>
  );
}
