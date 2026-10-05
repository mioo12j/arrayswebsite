import { useState } from 'react';
import { ShieldAlert, Loader2, KeyRound, Mail } from 'lucide-react';
import { api, apiError } from '../../api/client.js';
import { useToast } from '../ui/Toast.jsx';
import Modal from '../ui/Modal.jsx';

// #1 Enhanced security verification: password re-authentication → email code.
// Props are unchanged so every caller keeps working: { action, objectType,
// objectId, reason, onVerified(token), onClose }.
export default function OtpModal({ action, objectType, objectId, reason, onVerified, onClose }) {
  const toast = useToast();
  const [step, setStep] = useState('password'); // password | code
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);

  const submitPassword = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/gst/otp/request', { action, objectType, objectId, reason, password });
      setChallenge(data); setStep('code');
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const submitCode = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/gst/otp/verify', { challengeId: challenge.challengeId, code });
      onVerified(data.token);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Security verification" size="sm"
      footer={step === 'password'
        ? <><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submitPassword} disabled={busy || !password}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Verify password'}</button></>
        : <><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submitCode} disabled={busy || code.length < 6}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Verify & Proceed'}</button></>}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-600"><ShieldAlert size={20} /></div>
        <div className="flex-1">
          <p className="text-sm text-slate-600 dark:text-slate-300">This is a legally sensitive action and needs two-step verification.</p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${step === 'password' ? 'bg-brand-100 text-brand-700' : 'bg-emerald-100 text-emerald-700'}`}><KeyRound size={11} /> 1. Password</span>
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${step === 'code' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}><Mail size={11} /> 2. Email code</span>
          </div>

          {step === 'password' ? (
            <>
              <p className="mt-3 text-xs text-slate-400">Re-enter your account password to confirm it's you.</p>
              <input type="password" className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoFocus onKeyDown={(e) => e.key === 'Enter' && password && submitPassword()} />
            </>
          ) : (
            <>
              {challenge?.simulated && (
                <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">Code sent to your email. Simulation code: <span className="font-mono text-lg font-bold tracking-widest text-brand-600">{challenge.devCode}</span><br /><span className="text-xs text-slate-400">In production this is emailed to your registered address.</span></p>
              )}
              <input className="input mt-3 text-center font-mono text-lg tracking-[0.5em]" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="------" autoFocus onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && submitCode()} />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
