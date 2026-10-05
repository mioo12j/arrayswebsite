// ============================================================================
//  "Upload on the GST portal" helper.
//
//  Offline filing flow: download the Portal JSON here → open the govt IRP /
//  e-Way-Bill portal → log in → bulk-upload the JSON → bring the IRN/Ack/QR
//  back. This popup gives a one-click portal link, the saved login, and the
//  upload steps.
//
//  The login is stored SERVER-SIDE (shared across devices) and only the EDITOR
//  may set it. Anyone signed in can read the URL + user id; the password is
//  revealed only after the requester re-enters their OWN login password.
// ============================================================================
import { useState } from 'react';
import { ExternalLink, Upload, Copy, Eye, EyeOff, Save, Check, Lock, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import { useToast } from '../ui/Toast.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { api, apiError } from '../../api/client.js';

const DEFAULTS = {
  einvoice: { url: 'https://einvoice2.gst.gov.in/', label: 'e-Invoice (IRP) portal' },
  ewb: { url: 'https://einvoice2.gst.gov.in/', label: 'e-Way Bill portal' },
};

const STEPS = {
  einvoice: [
    'Click “Download Portal JSON” (single) or “Bulk JSON” (all pending) to save the .json file.',
    'Open the portal below and log in.',
    'Go to E-Invoice → Bulk Upload (or Bulk IRN Generation).',
    'Choose the downloaded .json file and submit — the portal returns the IRN, Ack No and a signed PDF per invoice.',
    'Back here, open the invoice → Enter IRN → “Scan signed PDF / QR image” and upload the signed PDF to auto-fill the IRN, Ack No and QR.',
  ],
  ewb: [
    'Download the e-Way Bill JSON for the document.',
    'Open the portal below and log in.',
    'Go to e-Waybill → Generate Bulk and choose the .json file.',
    'Submit — the portal returns the EWB number and validity.',
    'Record the EWB number back here on the document.',
  ],
};

export default function PortalUploadButton({ kind = 'einvoice', compact = false }) {
  const toast = useToast();
  const { isEditor } = useAuth();
  const [open, setOpen] = useState(false);

  const [url, setUrl] = useState(DEFAULTS[kind].url);
  const [userId, setUserId] = useState('');
  const [hasPassword, setHasPassword] = useState(false);

  const [edit, setEdit] = useState(false);
  const [editPwd, setEditPwd] = useState('');     // new password while editing (blank = keep current)
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  // Reveal flow — re-enter the app login password to see the stored portal password.
  const [revealed, setRevealed] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [asking, setAsking] = useState(false);
  const [loginPwd, setLoginPwd] = useState('');
  const [verifying, setVerifying] = useState(false);

  const loadCfg = async () => {
    try {
      const { data } = await api.get('/gst/portal-config');
      const c = data?.[kind] || {};
      setUrl(c.url || DEFAULTS[kind].url);
      setUserId(c.userId || '');
      setHasPassword(!!c.hasPassword);
    } catch { /* not permitted / offline — keep defaults */ }
  };
  const openModal = () => { setOpen(true); loadCfg(); };
  const close = () => { setOpen(false); setEdit(false); setEditPwd(''); setRevealed(''); setShowPwd(false); setAsking(false); setLoginPwd(''); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { kind, url: url.trim(), userId: userId.trim() };
      if (editPwd) body.password = editPwd;        // only changes the password when typed
      const { data } = await api.put('/gst/portal-config', body);
      setHasPassword(!!data.hasPassword); setEdit(false); setEditPwd(''); setRevealed('');
      toast.success('Portal login saved');
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };

  const unlock = async () => {
    if (!loginPwd) return;
    setVerifying(true);
    try {
      const { data } = await api.post('/gst/portal-config/reveal', { kind, password: loginPwd });
      setRevealed(data.password || ''); setShowPwd(true); setAsking(false); setLoginPwd('');
    } catch (e) { toast.error(apiError(e) || 'Password incorrect'); }
    finally { setVerifying(false); }
  };

  const copy = async (text, what) => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard blocked */ }
  };
  const openPortal = () => window.open(url || DEFAULTS[kind].url, '_blank', 'noopener,noreferrer');

  return (
    <>
      <button className={`btn-ghost ${compact ? '!py-1.5 !text-sm' : ''}`} onClick={openModal} title="Open the GST portal to upload the JSON">
        <Upload size={compact ? 15 : 16} /> Upload on GST Portal
      </button>

      <Modal open={open} onClose={close} title={`Upload on the ${DEFAULTS[kind].label}`} size="md"
        footer={<button className="btn-primary" onClick={openPortal}><ExternalLink size={16} /> Open portal</button>}>
        <div className="space-y-4 text-sm">
          {/* Login details */}
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Portal login</p>
              {isEditor && <button className="btn-ghost !py-1 !text-xs" disabled={saving} onClick={() => (edit ? save() : setEdit(true))}>
                {saving ? <Loader2 className="animate-spin" size={13} /> : edit ? <><Save size={13} /> Save</> : 'Edit'}
              </button>}
            </div>

            {edit ? (
              <div className="grid gap-2">
                <label className="text-xs text-slate-500">Portal URL
                  <input className="input mt-1 !py-1.5 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://einvoice2.gst.gov.in/" />
                </label>
                <label className="text-xs text-slate-500">User ID
                  <input className="input mt-1 !py-1.5 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="GST portal user id" />
                </label>
                <label className="text-xs text-slate-500">{hasPassword ? 'New password (leave blank to keep current)' : 'Password'}
                  <input className="input mt-1 !py-1.5 text-sm" type="password" value={editPwd} onChange={(e) => setEditPwd(e.target.value)} placeholder={hasPassword ? '•••••••• (unchanged)' : 'GST portal password'} />
                </label>
                <p className="text-[11px] leading-snug text-slate-400">Stored on the server and shared across devices. Only the editor can change it.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Row label="User ID" value={userId || '—'} onCopy={userId ? () => copy(userId, 'id') : null} copied={copied === 'id'} />
                <div className="flex items-start justify-between gap-2">
                  <span className="pt-1 text-slate-500">Password</span>
                  <div className="text-right">
                    {!hasPassword ? <span className="font-mono text-slate-400">{isEditor ? 'Not saved — click Edit' : 'Not set'}</span>
                      : !revealed ? (asking ? (
                        <div className="flex items-center gap-1.5">
                          <input className="input !w-40 !py-1 text-xs" type="password" autoFocus placeholder="Your login password"
                            value={loginPwd} onChange={(e) => setLoginPwd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} />
                          <button className="btn-ghost !py-1 !text-xs" disabled={verifying} onClick={unlock}>{verifying ? <Loader2 className="animate-spin" size={13} /> : 'Unlock'}</button>
                        </div>
                      ) : (
                        <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600" onClick={() => setAsking(true)}><Lock size={13} /> Reveal (enter login password)</button>
                      )) : (
                        <span className="flex items-center justify-end gap-2">
                          <span className="font-mono text-slate-800 dark:text-slate-100">{showPwd ? revealed : '•'.repeat(Math.min(revealed.length, 12))}</span>
                          <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowPwd((s) => !s)}>{showPwd ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                          <button className="text-slate-400 hover:text-brand-600" onClick={() => copy(revealed, 'pwd')}>{copied === 'pwd' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}</button>
                        </span>
                      )}
                  </div>
                </div>
                {!isEditor && !userId && !hasPassword && <p className="text-xs text-slate-400">The portal login hasn’t been set up yet — ask the editor to add it.</p>}
              </div>
            )}
          </div>

          {/* Steps */}
          <div>
            <p className="mb-2 font-semibold text-slate-700 dark:text-slate-200">How to upload</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
              {STEPS[kind].map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>

          <p className="text-xs text-slate-400">Portal: <span className="font-mono">{url || DEFAULTS[kind].url}</span></p>
        </div>
      </Modal>
    </>
  );
}

function Row({ label, value, onCopy, copied, extra }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-slate-800 dark:text-slate-100">{value}</span>
        {extra}
        {onCopy && <button className="text-slate-400 hover:text-brand-600" onClick={onCopy} title="Copy">{copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}</button>}
      </span>
    </div>
  );
}
