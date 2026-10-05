import { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Menu, Moon, Sun, LogOut, ChevronDown, ShieldCheck, UserCircle2, Languages, Building, Search, X, DatabaseBackup, Loader2, AlertTriangle, CloudUpload, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useI18n } from '../../context/I18nContext.jsx';
import { useBranch } from '../../context/BranchContext.jsx';
import { useUnsaved } from '../../context/UnsavedChangesContext.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../ui/Toast.jsx';
import GlobalSearch from '../gst/GlobalSearch.jsx';

const ROLE_LABEL = { editor: 'Editor', admin: 'Admin', operator: 'System Manager', auditor: 'Auditor' };

function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem('epc_theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('epc_theme', dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth();
  const { lang, toggle: toggleLang } = useI18n();
  const { branches, branchId, setBranchId } = useBranch();
  const location = useLocation();
  const onGst = location.pathname.startsWith('/gst');
  const [dark, toggleDark] = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [logoutAsk, setLogoutAsk] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [backing, setBacking] = useState(false);
  const { dirty } = useUnsaved();
  const toast = useToast();
  const ref = useRef(null);

  const [doing, setDoing] = useState('');   // '' | 'backup' | 'publish'

  // §7 Before logout — take a local backup AND publish to the cloud (so the
  // owner always sees the latest), then sign out. Never silently lose work.
  const backupAndLogout = async () => {
    setBacking(true);
    try { await api.post('/gst/backups', { kind: 'manual' }); toast.success('Local backup created'); }
    catch { toast.error('Backup failed — continuing'); }
    try { await logout(); }   // logout() publishes to cloud (flush-on-exit) before clearing
    finally { setBacking(false); }
  };

  // Sign out and publish, without a local backup.
  const publishAndLogout = async () => {
    setBacking(true);
    try { await logout(); } finally { setBacking(false); }
  };

  // One-click backup / publish (operator) — always reachable from the account menu.
  const backupNow = async () => {
    setDoing('backup');
    try { const { data } = await api.post('/gst/backups', { kind: 'manual' }); toast.success(`Backup created — ${data.totalRecords} records, ${data.file_count} files`); }
    catch (e) { toast.error(e?.response?.data?.error || 'Backup failed'); }
    finally { setDoing(''); setMenuOpen(false); }
  };
  const publishNow = async () => {
    setDoing('publish');
    try { const { data } = await api.post('/system/sync-to-cloud'); toast.success(`Published ${data.published ?? ''} records to cloud`); }
    catch (e) { toast.error(e?.response?.data?.error || 'Publish failed — is the cloud configured?'); }
    finally { setDoing(''); setMenuOpen(false); }
  };

  useEffect(() => {
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setMenuOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 lg:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden">
        <Menu size={20} />
      </button>

      <div className="hidden flex-1 items-center sm:flex">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setMobileSearch(true)}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 sm:hidden"
          title="Search"
        >
          <Search size={18} />
        </button>
        {onGst && branches.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900" data-no-i18n>
            <Building size={15} className="text-slate-400" />
            <select className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none dark:text-slate-200" value={branchId} onChange={(e) => setBranchId(e.target.value)} title="Active branch / GSTIN">
              <option value="all">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
            </select>
          </div>
        )}
        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Switch language"
          data-no-i18n
        >
          <Languages size={18} />
          <span>{lang === 'hi' ? 'हिं' : 'EN'}</span>
        </button>
        <button
          onClick={toggleDark}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Toggle theme"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative" ref={ref}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{user?.name}</p>
              <p className="flex items-center gap-1 text-[11px] text-slate-400">
                {user?.role === 'admin' && <ShieldCheck size={11} />} {ROLE_LABEL[user?.role] || user?.role}
              </p>
            </div>
            <ChevronDown size={16} className="text-slate-400" />
          </button>

          {menuOpen && (
            <div className="animate-fade-in absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <UserCircle2 size={16} /> {user?.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-400">{user?.email}</p>
              </div>
              <button onClick={backupNow} disabled={doing === 'backup'}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800">
                {doing === 'backup' ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />} Create Backup
              </button>
              <button onClick={publishNow} disabled={doing === 'publish'}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800">
                {doing === 'publish' ? <Loader2 className="animate-spin" size={16} /> : <CloudUpload size={16} />} Publish to Cloud
              </button>
              <Link to="/gst/backup" onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                <ShieldCheck size={16} /> Backup &amp; Restore
              </Link>
              <button onClick={() => { setMenuOpen(false); setPwOpen(true); }}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800">
                <KeyRound size={16} /> Change Password
              </button>
              <button
                onClick={() => { setMenuOpen(false); setLogoutAsk(true); }}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-900/20"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* §7 Logout safety — back up locally before leaving */}
      {logoutAsk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !backing && setLogoutAsk(false)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Sign out</h3>
            <p className="mt-1 text-sm text-slate-500">Signing out publishes your latest data to the cloud automatically. You can also take a local backup first.</p>
            {dirty && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                <AlertTriangle size={14} /> You have unsaved changes in an open form.
              </div>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <button className="btn-primary justify-center" disabled={backing} onClick={backupAndLogout}>
                {backing ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />} Backup, Publish &amp; Sign Out
              </button>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1 justify-center" disabled={backing} onClick={() => setLogoutAsk(false)}>Cancel</button>
                <button className="btn-ghost flex-1 justify-center" disabled={backing} onClick={publishAndLogout}>Publish &amp; sign out</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}

      {mobileSearch && (
        <div className="absolute inset-x-0 top-0 z-30 flex h-16 items-center gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 sm:hidden">
          <div className="flex-1"><GlobalSearch /></div>
          <button onClick={() => setMobileSearch(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Close search">
            <X size={20} />
          </button>
        </div>
      )}
    </header>
  );
}

// Self-service password change — current password + new password.
function ChangePasswordModal({ onClose }) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (nw.length < 6) return toast.error('New password must be at least 6 characters');
    if (nw !== cf) return toast.error('New passwords do not match');
    setSaving(true);
    try { await api.post('/auth/change-password', { currentPassword: cur, newPassword: nw }); toast.success('Password changed'); onClose(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Could not change password'); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white"><KeyRound size={18} /> Change Password</h3>
        <p className="mt-1 text-sm text-slate-500">Enter your current password, then choose a new one.</p>
        <div className="mt-4 space-y-2">
          <input className="input" type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} />
          <input className="input" type="password" placeholder="New password (min 6 characters)" value={nw} onChange={(e) => setNw(e.target.value)} />
          <input className="input" type="password" placeholder="Confirm new password" value={cf} onChange={(e) => setCf(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1 justify-center" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1 justify-center" disabled={saving} onClick={submit}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Update'}</button>
        </div>
      </div>
    </div>
  );
}
