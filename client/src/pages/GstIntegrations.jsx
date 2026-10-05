import { useState, useEffect } from 'react';
import { Mail, Plug, ShieldCheck, Loader2, Send, FlaskConical, MessageCircle, Cloud } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Field, Badge, Loading } from '../components/ui/index.jsx';
import OtpModal from '../components/gst/OtpModal.jsx';

export default function GstIntegrations() {
  const toast = useToast();
  const { data, loading, refetch } = useFetch('/gst/integrations');
  const [email, setEmail] = useState({});
  const [gst, setGst] = useState({});
  const [pending, setPending] = useState(null);   // { type, values }
  const [otp, setOtp] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => { if (data) { setEmail(data.email || {}); setGst({ ...(data.gst || {}), mode: data.gst?.mode || 'simulation' }); } }, [data]);

  const save = async (type, values, otpToken) => {
    setBusy(type);
    try { await api.post('/gst/integrations', { type, values, otpToken }); toast.success(`${type} settings saved`); setOtp(false); setPending(null); refetch(); }
    catch (e) { if (e?.response?.status === 428) setOtp(true); else toast.error(apiError(e)); }
    finally { setBusy(''); }
  };
  const requestSave = (type, values) => { setPending({ type, values }); save(type, values); };
  const test = async (path, label) => { setBusy(label); try { const { data } = await api.post(path); toast[data.ok ? 'success' : 'error'](`${data.status}: ${data.message}`); } catch (e) { toast.error(apiError(e)); } finally { setBusy(''); } };

  const setE = (k) => (e) => setEmail((x) => ({ ...x, [k]: e.target.value }));
  const setG = (k) => (e) => setGst((x) => ({ ...x, [k]: e.target.value }));

  if (loading) return <Loading label="Loading integrations…" />;

  return (
    <div>
      <PageHeader title="Integration & Environment Management" subtitle="Configure email and GST integrations directly — no source-code edits to go live. Changes need 2-step verification and are audited." />

      {/* GST integration */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <Plug size={18} className="text-brand-600" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">GST Integration (IRP / e-Way Bill)</h3>
          <Badge tone={gst.mode === 'live' ? 'green' : 'amber'}>{gst.mode === 'live' ? 'LIVE' : 'Simulation'}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Mode"><select className="input" value={gst.mode || 'simulation'} onChange={setG('mode')}><option value="simulation">Simulation (safe)</option><option value="live">Live (real submission)</option></select></Field>
          <Field label="Client ID"><input className="input" value={gst.clientId || ''} onChange={setG('clientId')} /></Field>
          <Field label="Client Secret"><input className="input" type="password" value={gst.clientSecret || ''} onChange={setG('clientSecret')} placeholder={gst._hasSecrets ? '•••••••• (set)' : ''} /></Field>
          <Field label="API Key"><input className="input" type="password" value={gst.apiKey || ''} onChange={setG('apiKey')} /></Field>
          <Field label="GSP Username"><input className="input" value={gst.gspUsername || ''} onChange={setG('gspUsername')} /></Field>
          <Field label="GSP Password"><input className="input" type="password" value={gst.gspPassword || ''} onChange={setG('gspPassword')} /></Field>
          <Field label="IRP URL"><input className="input" value={gst.irpUrl || ''} onChange={setG('irpUrl')} placeholder="https://…" /></Field>
          <Field label="EWB URL"><input className="input" value={gst.ewbUrl || ''} onChange={setG('ewbUrl')} placeholder="https://…" /></Field>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary" onClick={() => requestSave('gst', gst)} disabled={busy === 'gst'}>{busy === 'gst' ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />} Save</button>
          <button className="btn-ghost" onClick={() => test('/gst/integrations/test-gst', 'testgst')} disabled={busy === 'testgst'}><FlaskConical size={16} /> Test Connection</button>
        </div>
        {gst.mode === 'live' && <p className="mt-2 text-xs text-amber-600">Live mode submits real compliance data. Ensure credentials and the live adapter handshake are configured.</p>}
      </Card>

      {/* Email */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2"><Mail size={18} className="text-brand-600" /><h3 className="font-semibold text-slate-800 dark:text-slate-100">Email (SMTP)</h3></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="SMTP Server"><input className="input" value={email.smtpHost || ''} onChange={setE('smtpHost')} placeholder="smtp.gmail.com" /></Field>
          <Field label="SMTP Port"><input className="input" value={email.smtpPort || ''} onChange={setE('smtpPort')} placeholder="587" /></Field>
          <Field label="Username"><input className="input" value={email.username || ''} onChange={setE('username')} /></Field>
          <Field label="Password"><input className="input" type="password" value={email.password || ''} onChange={setE('password')} placeholder={email._hasSecrets ? '•••••••• (set)' : ''} /></Field>
          <Field label="Sender Address"><input className="input" value={email.sender || ''} onChange={setE('sender')} /></Field>
          <Field label="Reply-To Address"><input className="input" value={email.replyTo || ''} onChange={setE('replyTo')} /></Field>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary" onClick={() => requestSave('email', email)} disabled={busy === 'email'}>{busy === 'email' ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />} Save</button>
          <button className="btn-ghost" onClick={() => test('/gst/integrations/test-email', 'testemail')} disabled={busy === 'testemail'}><Send size={16} /> Test Connection</button>
        </div>
      </Card>

      {/* Future integrations */}
      <Card>
        <h3 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Future Integrations</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[['SMS', MessageCircle], ['WhatsApp', MessageCircle], ['Cloud Storage', Cloud]].map(([label, Ic]) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 dark:border-slate-700">
              <Ic size={20} className="text-slate-400" />
              <div><p className="font-medium text-slate-700 dark:text-slate-200">{label}</p><p className="text-xs text-slate-400">Configurable here when enabled — no code changes.</p></div>
            </div>
          ))}
        </div>
      </Card>

      {otp && pending && <OtpModal action="config_change" objectType="system" reason={`Update ${pending.type} integration`} onVerified={(token) => { setOtp(false); save(pending.type, pending.values, token); }} onClose={() => { setOtp(false); setPending(null); }} />}
    </div>
  );
}
