import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Eye, ShieldCheck, Wrench } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import UpdateNotice from '../UpdateNotice.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFetch } from '../../lib/useFetch.js';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuditor } = useAuth();
  const { data: perms } = useFetch('/gst/me/permissions');
  const live = perms?.mode === 'live';
  const maint = perms?.maintenanceMode;

  // #10 Backup-before-exit: warn if today's backup hasn't been taken.
  useEffect(() => {
    if (perms && perms.hasTodayBackup === false) {
      const h = (e) => { e.preventDefault(); e.returnValue = 'Daily backup has not been completed. A backup is recommended before closing the application.'; return e.returnValue; };
      window.addEventListener('beforeunload', h);
      return () => window.removeEventListener('beforeunload', h);
    }
  }, [perms?.hasTodayBackup]);
  return (
    <div className="flex h-full flex-col">
      {/* #6 Environment safety banner — always visible, app-wide */}
      {perms?.mode && (
        <div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-bold tracking-wide text-white ${live ? 'bg-red-600' : 'bg-emerald-600'}`} data-no-i18n>
          {live ? <><ShieldCheck size={14} /> LIVE GST ENVIRONMENT — REAL COMPLIANCE DATA</> : <><ShieldCheck size={14} /> LIVE — OFFLINE FILING · UPLOAD THE JSON ON THE GOVERNMENT PORTAL</>}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setSidebarOpen(true)} />
          {isAuditor && (
            <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white">
              <Eye size={14} /> AUDIT MODE — read-only review. Editing, submission, cancellation and configuration are disabled.
            </div>
          )}
          {maint === 'readonly' && (
            <div className="flex items-center justify-center gap-2 bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white" data-no-i18n>
              <Eye size={14} /> READ-ONLY MODE — the system is temporarily frozen for changes.
            </div>
          )}
          {maint === 'maintenance' && (
            <div className="flex items-center justify-center gap-2 bg-red-700 px-4 py-1.5 text-xs font-semibold text-white" data-no-i18n>
              <Wrench size={14} /> MAINTENANCE MODE — administrator access only.
            </div>
          )}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="mx-auto max-w-7xl animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <UpdateNotice />
    </div>
  );
}
