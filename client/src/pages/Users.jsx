import { useState } from 'react';
import { Plus, Loader2, ShieldCheck, User } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { PageHeader, Card, Loading, Table, Badge, Field } from '../components/ui/index.jsx';
import { fmtDateTime } from '../lib/format.js';

const roleTone = { editor: 'purple', admin: 'blue', operator: 'slate', auditor: 'amber' };
const roleLabel = { editor: 'Editor', admin: 'Admin', operator: 'System Manager', auditor: 'Auditor' };

export default function Users() {
  const toast = useToast();
  const { isEditor } = useAuth();
  const { data: users, loading, refetch } = useFetch('/users');
  const [open, setOpen] = useState(false);
  const [resetUser, setResetUser] = useState(null);

  const toggleActive = async (u) => {
    try {
      await api.patch(`/users/${u.id}`, { is_active: !u.is_active });
      refetch();
      toast.success(`User ${u.is_active ? 'disabled' : 'enabled'}`);
    } catch (err) { toast.error(apiError(err)); }
  };

  return (
    <div>
      <PageHeader title="User Management" subtitle="Manage Editor, Admin and Operator accounts."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New User</button>} />

      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table
            columns={[{ header: 'Name' }, { header: 'Login ID' }, { header: 'Role' }, { header: 'Status' }, { header: 'Last Login' }, { header: '' }]}
            rows={users || []}
            empty="No users."
            renderRow={(u) => (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  {u.role === 'admin' ? <ShieldCheck size={15} className="text-brand-500" /> : <User size={15} className="text-slate-400" />}
                  {u.name}
                </td>
                <td className="td font-mono text-xs">{u.email}</td>
                <td className="td"><Badge tone={roleTone[u.role] || 'slate'}>{roleLabel[u.role] || u.role}</Badge></td>
                <td className="td"><Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Disabled'}</Badge></td>
                <td className="td text-slate-500">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td>
                <td className="td text-right whitespace-nowrap">
                  <button className="btn-ghost !py-1 !px-2.5 !text-xs" onClick={() => setResetUser(u)}>Reset password</button>
                  <button className="btn-ghost !ml-1 !py-1 !px-2.5 !text-xs" onClick={() => toggleActive(u)}>
                    {u.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </>
            )}
          />
        )}
      </Card>

      {open && <UserModal isEditor={isEditor} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refetch(); toast.success('User created'); }} />}
      {resetUser && <ResetPwModal user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  );
}

// Admin/editor sets a new password for any user.
function ResetPwModal({ user, onClose }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [cf, setCf] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (pw.length < 6) return toast.error('Password must be at least 6 characters');
    if (pw !== cf) return toast.error('Passwords do not match');
    setSaving(true);
    try { await api.post(`/users/${user.id}/reset-password`, { newPassword: pw }); toast.success(`Password reset for ${user.name}`); onClose(); }
    catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={saving} onClick={submit}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Set Password'}</button>
      </>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Set a new login password for <b>{user.name}</b> ({user.email}). They can change it themselves later from their account menu.</p>
        <Field label="New password" required hint="Minimum 6 characters"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirm password" required><input className="input" type="password" value={cf} onChange={(e) => setCf(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
      </div>
    </Modal>
  );
}

function UserModal({ onClose, onSaved, isEditor }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operator' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name || !form.email || !form.password) return toast.error('All fields are required');
    setSaving(true);
    try {
      await api.post('/users', { ...form, email: form.email.trim().toLowerCase() });
      onSaved();
    } catch (err) { toast.error(apiError(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="New User"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Create User'}</button>
      </>}>
      <div className="space-y-4">
        <Field label="Full Name" required><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="Login ID" required hint="What the user types to sign in (e.g. ramesh)"><input className="input" value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" required hint="Minimum 6 characters"><input className="input" type="password" value={form.password} onChange={set('password')} /></Field>
        <Field label="Role" required>
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
            <option value="auditor">Auditor (read-only)</option>
            {isEditor && <option value="editor">Editor (super-admin)</option>}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
