// Consolidated hub pages — each merges several previously-separate screens into
// one tabbed page so the menu stays short and there's a single entry point per
// concern. The existing screens are reused verbatim as tab panels (no feature
// is lost); admin-only tabs are gated by role.
import { useState } from 'react';
import {
  Rss, Activity, ScrollText, BarChart3, CalendarClock, Bell, HeartPulse,
  Stethoscope, ClipboardCheck, DatabaseBackup, DatabaseZap, Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

import GstFeed from './GstFeed.jsx';
import GstActivity from './GstActivity.jsx';
import Audit from './Audit.jsx';
import Reports from './Reports.jsx';
import GstReports from './GstReports.jsx';
import GstSchedules from './GstSchedules.jsx';
import GstNotifications from './GstNotifications.jsx';
import GstHealth from './GstHealth.jsx';
import GstDiagnostics from './GstDiagnostics.jsx';
import GstReadiness from './GstReadiness.jsx';
import GstBackup from './GstBackup.jsx';
import System from './System.jsx';
import GstSystem from './GstSystem.jsx';

function HubTabs({ tabs }) {
  const list = tabs.filter(Boolean);
  const [active, setActive] = useState(list[0]?.key);
  const cur = list.find((t) => t.key === active) || list[0];
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {list.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition ${
              active === t.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.icon && <t.icon size={15} />} {t.label}
          </button>
        ))}
      </div>
      <div key={cur?.key}>{cur?.el}</div>
    </div>
  );
}

// Activity Feed + Activity Log + Audit Log
export function ActivityHub() {
  const { isAdmin } = useAuth();
  return (
    <HubTabs
      tabs={[
        { key: 'feed', label: 'Activity Feed', icon: Rss, el: <GstFeed /> },
        { key: 'log', label: 'Activity Log', icon: Activity, el: <GstActivity /> },
        isAdmin && { key: 'audit', label: 'Audit Log', icon: ScrollText, el: <Audit /> },
      ]}
    />
  );
}

// Financial Reports + Compliance Reports + Scheduled Reports
export function ReportsHub() {
  return (
    <HubTabs
      tabs={[
        { key: 'fin', label: 'Financial Reports', icon: BarChart3, el: <Reports /> },
        { key: 'gst', label: 'Compliance Reports', icon: BarChart3, el: <GstReports /> },
        { key: 'sched', label: 'Scheduled Reports', icon: CalendarClock, el: <GstSchedules /> },
      ]}
    />
  );
}

// Alerts + API Health + Diagnostics + Production Readiness
export function SystemStatusHub() {
  const { isAdmin } = useAuth();
  return (
    <HubTabs
      tabs={[
        { key: 'alerts', label: 'Alerts', icon: Bell, el: <GstNotifications /> },
        isAdmin && { key: 'health', label: 'API Health', icon: HeartPulse, el: <GstHealth /> },
        isAdmin && { key: 'diag', label: 'Diagnostics', icon: Stethoscope, el: <GstDiagnostics /> },
        isAdmin && { key: 'ready', label: 'Production Readiness', icon: ClipboardCheck, el: <GstReadiness /> },
      ]}
    />
  );
}

// Data Management + Backup & Recovery + System Control (config export)
export function DataAdminHub() {
  const { isAdmin } = useAuth();
  return (
    <HubTabs
      tabs={[
        { key: 'data', label: 'Data Management', icon: DatabaseZap, el: <System /> },
        isAdmin && { key: 'backup', label: 'Backup & Recovery', icon: DatabaseBackup, el: <GstBackup /> },
        isAdmin && { key: 'system', label: 'System Control', icon: Settings, el: <GstSystem /> },
      ]}
    />
  );
}
