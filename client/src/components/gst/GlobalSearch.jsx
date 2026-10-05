import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Clock, X } from 'lucide-react';
import { api } from '../../api/client.js';

const TYPE_TONE = {
  'e-Invoice': 'bg-brand-100 text-brand-700', 'e-Way Bill': 'bg-purple-100 text-purple-700',
  Customer: 'bg-emerald-100 text-emerald-700', Vendor: 'bg-amber-100 text-amber-700',
  Invoice: 'bg-brand-100 text-brand-700', Branch: 'bg-slate-100 text-slate-600',
  User: 'bg-slate-100 text-slate-600', Attachment: 'bg-slate-100 text-slate-600',
  Comment: 'bg-purple-100 text-purple-700', Audit: 'bg-slate-100 text-slate-500',
};
const recents = () => { try { return JSON.parse(localStorage.getItem('gst_recent_searches') || '[]'); } catch { return []; } };

export default function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState(recents());
  const ref = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onChange = (val) => {
    setQ(val); setOpen(true);
    clearTimeout(timer.current);
    if (val.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try { const { data } = await api.get(`/gst/search?q=${encodeURIComponent(val)}`); setResults(data || []); } catch { setResults([]); }
    }, 250);
  };
  const go = (r) => {
    const next = [q.trim(), ...recent.filter((x) => x !== q.trim())].slice(0, 6);
    localStorage.setItem('gst_recent_searches', JSON.stringify(next)); setRecent(next);
    setOpen(false); setQ(''); setResults([]);
    if (r?.link) nav(r.link);
  };

  return (
    <div className="relative w-full max-w-md" ref={ref} data-no-i18n>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        className="input !py-1.5 pl-9 text-sm" placeholder="Search invoices, IRN, EWB, GSTIN, customers…"
        value={q} onFocus={() => setOpen(true)} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && results[0]) go(results[0]); }}
      />
      {open && (q.trim().length >= 2 || recent.length > 0) && (
        <div className="absolute z-30 mt-1 max-h-96 w-[min(28rem,90vw)] overflow-auto rounded-xl border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900">
          {q.trim().length < 2 ? (
            <div className="p-2">
              <p className="px-2 py-1 text-xs font-semibold uppercase text-slate-400">Recent searches</p>
              {recent.map((r) => (
                <button key={r} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => onChange(r)}>
                  <Clock size={13} className="text-slate-400" /> {r}
                </button>
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">No matches for “{q}”.</p>
          ) : (
            <ul className="p-1">
              {results.map((r, i) => (
                <li key={i}>
                  <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => go(r)}>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_TONE[r.type] || 'bg-slate-100 text-slate-600'}`}>{r.type}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">{r.label || '—'}</span>
                      {r.sublabel && <span className="block truncate text-xs text-slate-400">{r.sublabel}</span>}
                    </span>
                    {r.status && <span className="shrink-0 text-xs text-slate-400">{r.status}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
