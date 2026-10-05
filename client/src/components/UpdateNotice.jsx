// ============================================================================
//  Software update notice. On login (and every 30 min) it asks the server
//  whether the install's git commit differs from the latest on the release
//  branch. If so, a small card appears bottom-right. The System Manager / Editor
//  can click "Update now" — the server backs up, a detached script pulls + builds
//  + migrates + restarts, and this page reloads automatically onto the new
//  version. The local database (your data) is never touched.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, X, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from './ui/Toast.jsx';

export default function UpdateNotice() {
  const { user, canWrite } = useAuth();       // canWrite = System Manager / Editor (not admin/auditor)
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | applying | restarting
  const pollRef = useRef(null);

  const check = async () => {
    try { const { data } = await api.get('/system/update/status'); setStatus(data); } catch { /* offline / not available */ }
  };

  useEffect(() => {
    if (!user) return undefined;
    check();
    const id = setInterval(check, 30 * 60 * 1000);
    return () => { clearInterval(id); if (pollRef.current) clearTimeout(pollRef.current); };
  }, [user?.id]);

  const apply = async () => {
    setPhase('applying');
    try {
      const { data } = await api.post('/system/update/apply');
      if (!data.started) { toast.info(data.message || 'Already up to date'); setPhase('idle'); check(); return; }
      setPhase('restarting');
      // The server is rebuilding + restarting. Poll until it answers on the new
      // version, then reload. Building can take a minute, so wait before polling.
      const startedAt = Date.now();
      const poll = async () => {
        try {
          const r = await api.get('/system/update/status');
          if (r.data && r.data.online && r.data.behind === false) { window.location.reload(); return; }
        } catch { /* server still down mid-restart */ }
        if (Date.now() - startedAt < 5 * 60 * 1000) pollRef.current = setTimeout(poll, 5000);
        else window.location.reload();
      };
      pollRef.current = setTimeout(poll, 15000);
    } catch (e) {
      setPhase('idle');
      toast.error(e?.response?.data?.error || 'Could not start the update.');
    }
  };

  // Restarting overlay — shown until the page reloads itself.
  if (phase === 'restarting') {
    return (
      <div className="fixed bottom-5 right-5 z-[110] w-80 rounded-xl border border-brand-200 bg-white p-4 shadow-soft dark:border-brand-900/40 dark:bg-slate-900">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Loader2 size={16} className="animate-spin text-brand-600" /> Updating the software…
        </p>
        <p className="mt-1 text-xs text-slate-500">The app is rebuilding and restarting. This can take a minute — this page will reload automatically. Your data is safe.</p>
      </div>
    );
  }

  if (!status?.behind || dismissed) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[110] w-80 rounded-xl border border-brand-200 bg-white p-4 shadow-soft dark:border-brand-900/40 dark:bg-slate-900">
      <div className="flex items-start gap-2">
        <ArrowUpCircle size={18} className="mt-0.5 shrink-0 text-brand-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Update available</p>
          <p className="mt-0.5 text-xs text-slate-500">
            A newer version of the software has been published.
            <span className="ml-1 font-mono text-[11px] text-slate-400">{status.currentShort} → {status.latestShort}</span>
          </p>
          {canWrite ? (
            <div className="mt-3 flex gap-2">
              <button className="btn-primary !py-1.5 !text-sm" disabled={phase === 'applying'} onClick={apply}>
                {phase === 'applying' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Update now
              </button>
              <button className="btn-ghost !py-1.5 !text-sm" onClick={() => setDismissed(true)}>Later</button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Ask the System Manager or Editor to apply it.</p>
          )}
        </div>
        <button onClick={() => setDismissed(true)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      </div>
      {canWrite && <p className="mt-2 text-[11px] leading-snug text-slate-400">A backup is taken first; your data is kept and upgraded — only the program code changes.</p>}
    </div>
  );
}
