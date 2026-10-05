import { useState } from 'react';
import { Power, Eye, Wrench, Loader2, FileJson, Settings } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Badge } from '../components/ui/index.jsx';
import { gstDownload } from '../lib/gst.js';
import OtpModal from '../components/gst/OtpModal.jsx';

const MODES = [
  { key: 'normal', label: 'Normal', icon: Power, tone: 'green', desc: 'Everyone works as usual.' },
  { key: 'readonly', label: 'Read-Only', icon: Eye, tone: 'amber', desc: 'Everyone can view; changes are disabled (editor can still act).' },
  { key: 'maintenance', label: 'Maintenance', icon: Wrench, tone: 'red', desc: 'Only administrators can access; others see a maintenance notice.' },
];

export default function GstSystem() {
  const toast = useToast();
  const { data: mm, refetch } = useFetch('/gst/maintenance');
  const [pending, setPending] = useState(null);   // { mode, message }
  const [otp, setOtp] = useState(false);
  const current = mm?.mode || 'normal';

  const apply = async (mode, message, otpToken) => {
    try { await api.post('/gst/maintenance', { mode, message, otpToken }); toast.success(`System mode: ${mode}`); setPending(null); setOtp(false); refetch(); }
    catch (e) { if (e?.response?.status === 428) setOtp(true); else toast.error(apiError(e)); }
  };
  const choose = (mode) => {
    if (mode === current) return;
    const message = mode === 'maintenance' ? (window.prompt('Maintenance notice to show users (optional):') || '') : '';
    setPending({ mode, message }); apply(mode, message);
  };

  return (
    <div>
      <PageHeader title="System Control" subtitle="Maintenance mode and configuration export." />

      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <Settings size={18} className="text-slate-400" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Maintenance Mode</h3>
          <Badge tone={MODES.find((m) => m.key === current)?.tone}>{current}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MODES.map((m) => (
            <button key={m.key} onClick={() => choose(m.key)} disabled={m.key === current}
              className={`rounded-xl border p-4 text-left transition ${m.key === current ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'}`}>
              <m.icon size={20} className={m.tone === 'green' ? 'text-emerald-600' : m.tone === 'amber' ? 'text-amber-600' : 'text-red-600'} />
              <p className="mt-2 font-semibold text-slate-800 dark:text-slate-100">{m.label}{m.key === current && ' (active)'}</p>
              <p className="mt-0.5 text-xs text-slate-500">{m.desc}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">Switching mode requires 2-step security verification and is recorded in the audit log.</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Configuration Export</h3>
            <p className="mt-1 text-sm text-slate-500">Export roles, branches, GST settings, number series, schedules, notification rules and branding as JSON — for migration, recovery or environment replication.</p>
          </div>
          <button className="btn-primary shrink-0" onClick={() => gstDownload('/gst/config/export', 'system-configuration.json')}><FileJson size={16} /> Export Config</button>
        </div>
      </Card>

      {otp && pending && <OtpModal action="maintenance_change" objectType="system" reason={`Switch system mode to ${pending.mode}`} onVerified={(token) => { setOtp(false); apply(pending.mode, pending.message, token); }} onClose={() => { setOtp(false); setPending(null); }} />}
    </div>
  );
}
