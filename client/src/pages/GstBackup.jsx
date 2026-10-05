import { useState, useRef } from 'react';
import { DatabaseBackup, ShieldCheck, Download, RotateCcw, Loader2, Eye, FlaskConical, HeartPulse, AlertTriangle, Upload, Trash2 } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Loading, Table, Badge } from '../components/ui/index.jsx';
import Modal from '../components/ui/Modal.jsx';
import { dmyt, gstDownload, inr } from '../lib/gst.js';
import OtpModal from '../components/gst/OtpModal.jsx';

const kb = (b) => b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

export default function GstBackup() {
  const toast = useToast();
  const { data: dash, refetch: refetchDash } = useFetch('/gst/backups/dashboard');
  const { data: rows, loading, refetch } = useFetch('/gst/backups');
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);   // { backup, data }
  const [restore, setRestore] = useState(null);   // { id, mode }
  const fileRef = useRef(null);
  const refreshAll = () => { refetch(); refetchDash(); };

  const onUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setBusy('upload');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/gst/backups/upload', fd);
      toast.success(`Backup imported — ${data.totalRecords} records. You can now verify or restore it.`);
      refreshAll();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(''); }
  };

  const create = async () => { setBusy('create'); try { const { data } = await api.post('/gst/backups', { kind: 'manual' }); toast.success(`Full backup — ${data.totalRecords} records, ${data.file_count} files`); refreshAll(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); } };
  const verify = async (id) => { setBusy(id); try { const { data } = await api.post(`/gst/backups/${id}/verify`); toast.success(`Verification: ${data.status}`); refreshAll(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); } };
  const drTest = async (id) => { setBusy(id); try { const { data } = await api.post(`/gst/backups/${id}/dr-test`); toast.success(`DR test: ${data.verification.status} — safe, no live data touched`); } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); } };
  const openPreview = async (b) => { setBusy(b.id); try { const { data } = await api.post(`/gst/backups/${b.id}/preview-restore`); setPreview({ backup: b, data }); } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); } };
  const delBackup = async (b) => {
    if (!window.confirm(`Delete this backup (${dmyt(b.started_at)})? The archive file is removed. Your live data is not affected.`)) return;
    setBusy(b.id);
    try { await api.delete(`/gst/backups/${b.id}`); toast.success('Backup deleted'); refreshAll(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  const doRestore = async (id, mode, otpToken) => {
    setBusy(id);
    try { const { data } = await api.post(`/gst/backups/${id}/restore`, { mode, otpToken }); toast.success(`Restored ${data.restored} records + ${data.filesRestored} files`); setRestore(null); setPreview(null); refreshAll(); }
    catch (e) { if (e?.response?.status === 428) setRestore({ id, mode }); else toast.error(apiError(e)); } finally { setBusy(''); }
  };

  return (
    <div>
      <PageHeader title="Full-System Backup & Disaster Recovery" subtitle="One timestamped ZIP of the entire application — every table plus attachment files."
        actions={<>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}>
            {busy === 'upload' ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} Upload Backup
          </button>
          <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={onUploadFile} />
          <button className="btn-primary" onClick={create} disabled={busy === 'create'}>{busy === 'create' ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />} Backup Now</button>
        </>} />

      {dash && !dash.hasToday && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/10">
          <AlertTriangle className="text-amber-600" size={20} />
          <p className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-300">Today’s backup has not been completed. Run a backup to protect your data.</p>
          <button className="btn-primary !py-1.5 !text-sm" onClick={create} disabled={busy === 'create'}>Run Backup Now</button>
        </div>
      )}

      {dash && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          <Stat label="Last Backup" value={dash.lastBackup ? dmyt(dash.lastBackup) : '—'} small />
          <Stat label="Last Success" value={dash.lastSuccess ? dmyt(dash.lastSuccess) : '—'} small />
          <Stat label="Last Failed" value={dash.lastFailed ? dmyt(dash.lastFailed) : 'None'} small />
          <Stat label="Last Size" value={kb(dash.lastSizeBytes)} />
          <Stat label="Duration" value={`${dash.lastDurationMs || 0} ms`} />
          <Stat label="Verification" value={dash.verificationStatus} />
          <Stat label="Health" value={dash.healthScore != null ? `${dash.healthScore}/100` : '—'} tone={dash.healthScore >= 80 ? 'text-emerald-600' : dash.healthScore >= 50 ? 'text-amber-600' : 'text-red-600'} icon={HeartPulse} />
        </div>
      )}

      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table columns={[{ header: 'When' }, { header: 'Records' }, { header: 'Files' }, { header: 'Size' }, { header: 'Health' }, { header: 'Verified' }, { header: '' }]}
            rows={rows || []} empty='No backups yet. Click "Backup Now".'
            renderRow={(b) => {
              const total = Object.values(b.record_counts || {}).reduce((a, c) => a + Number(c), 0);
              return (
                <>
                  <td className="td text-sm">{dmyt(b.started_at)}<div className="text-xs text-slate-400 capitalize">{b.kind} · {b.by_name}</div></td>
                  <td className="td">{total}</td>
                  <td className="td">{b.file_count ?? '—'}</td>
                  <td className="td">{kb(b.size_bytes)}</td>
                  <td className="td">{b.health != null ? <Badge tone={b.health >= 80 ? 'green' : b.health >= 50 ? 'amber' : 'red'}>{b.health}</Badge> : '—'}</td>
                  <td className="td">{b.verification?.status ? <Badge tone={b.verification.status === 'verified' ? 'green' : b.verification.status === 'warning' ? 'amber' : 'red'}>{b.verification.status}</Badge> : <Badge tone="slate">No</Badge>}</td>
                  <td className="td text-right">
                    <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={busy === b.id} onClick={() => verify(b.id)}><ShieldCheck size={12} /></button>
                    <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={busy === b.id} onClick={() => drTest(b.id)} title="DR test (safe)"><FlaskConical size={12} /></button>
                    <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={!b.exists || busy === b.id} onClick={() => openPreview(b)} title="Preview restore"><Eye size={12} /></button>
                    <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={!b.exists} onClick={() => gstDownload(`/gst/backups/${b.id}/download`, 'backup.zip')}><Download size={12} /></button>
                    <button className="btn-ghost !py-1 !px-2 !text-xs !text-red-600" disabled={busy === b.id} onClick={() => delBackup(b)} title="Delete this backup"><Trash2 size={12} /></button>
                  </td>
                </>
              );
            }} />
        )}
      </Card>
      <Retention dash={dash} onSaved={refreshAll} />
      <Card className="mt-4 !p-4"><p className="text-sm text-slate-500"><RotateCcw size={14} className="mr-1 inline" /> Restore is <strong>additive and non-destructive</strong> (never deletes current data), protected by 2-step verification. <strong>DR Test</strong> validates and simulates a restore without touching live data. For off-site safety, download the ZIP and store it securely.</p></Card>

      {/* Preview-restore modal */}
      {preview && (
        <Modal open onClose={() => setPreview(null)} title="Preview Restore" size="lg"
          footer={<><button className="btn-ghost" onClick={() => setPreview(null)}>Close</button><button className="btn-primary" onClick={() => doRestore(preview.backup.id, 'full')} disabled={busy === preview.backup.id}>{busy === preview.backup.id ? <Loader2 className="animate-spin" size={16} /> : 'Full Restore'}</button></>}>
          <p className="mb-3 text-sm text-slate-500">Additive restore inserts only records that are missing (existing rows are kept). {preview.data.fileCount} attachment file(s) will be restored if missing.</p>
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Table</th><th className="th text-right">In Backup</th><th className="th text-right">Current</th><th className="th text-right">Will Insert</th><th className="th text-right">Skip (exist)</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.data.tables.filter((t) => t.inBackup > 0).map((t) => (
                  <tr key={t.table}><td className="td font-mono text-xs">{t.table}</td><td className="td text-right">{t.inBackup}</td><td className="td text-right">{t.current}</td><td className="td text-right font-semibold text-emerald-600">{t.willInsert}</td><td className="td text-right text-slate-400">{t.willSkipExisting}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {restore && <OtpModal action="backup_restore" objectType="system" objectId={restore.id} reason={`${restore.mode} restore`} onVerified={(token) => { const r = restore; setRestore(null); doRestore(r.id, r.mode, token); }} onClose={() => setRestore(null)} />}
    </div>
  );
}

function Retention({ dash, onSaved }) {
  const toast = useToast();
  const r = dash?.retention || {};
  const [f, setF] = useState(null);
  const cur = f || { dailyDays: r.dailyDays || 30, weeklyWeeks: r.weeklyWeeks || 12, monthlyMonths: r.monthlyMonths || 24, storageThresholdMb: r.storageThresholdMb || 5000 };
  const set = (k) => (e) => setF({ ...cur, [k]: Number(e.target.value) });
  const save = async () => { try { await api.post('/gst/backups/retention', cur); toast.success('Retention policy saved'); onSaved?.(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Retention & Storage</h3>
          <p className="mt-1 text-sm text-slate-500">Older backups are cleaned up automatically. Storage used: <strong>{((dash?.storageBytes || 0) / 1048576).toFixed(0)} MB</strong> of {cur.storageThresholdMb} MB threshold {dash?.storageWarning && <span className="text-red-600">— over threshold!</span>}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">Daily (days)<input className="input !py-1.5 w-20" type="number" value={cur.dailyDays} onChange={set('dailyDays')} /></label>
          <label className="text-xs text-slate-500">Weekly (weeks)<input className="input !py-1.5 w-20" type="number" value={cur.weeklyWeeks} onChange={set('weeklyWeeks')} /></label>
          <label className="text-xs text-slate-500">Monthly (months)<input className="input !py-1.5 w-20" type="number" value={cur.monthlyMonths} onChange={set('monthlyMonths')} /></label>
          <label className="text-xs text-slate-500">Threshold (MB)<input className="input !py-1.5 w-24" type="number" value={cur.storageThresholdMb} onChange={set('storageThresholdMb')} /></label>
          <button className="btn-ghost !text-sm" onClick={save}>Save Policy</button>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone = 'text-slate-800', small, icon: Icon }) {
  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className={`mt-0.5 font-bold ${tone} dark:text-white ${small ? 'text-xs' : 'text-lg'}`}>{value}</p>
        </div>
        {Icon && <Icon size={18} className="shrink-0 text-slate-300" />}
      </div>
    </Card>
  );
}
