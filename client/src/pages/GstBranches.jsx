import { useState } from 'react';
import { Plus, Building2, Star, Loader2, Pencil } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useBranch } from '../context/BranchContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Table, Badge, Field } from '../components/ui/index.jsx';

export default function GstBranches() {
  const toast = useToast();
  const { reloadBranches } = useBranch();
  const { data: rows, loading, refetch } = useFetch('/gst/branches');
  const [form, setForm] = useState(null);

  const refreshAll = () => { refetch(); reloadBranches(); };
  const makeDefault = async (id) => { try { await api.post(`/gst/branches/${id}/default`); toast.success('Default branch updated'); refreshAll(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div>
      <PageHeader title="Branches & GSTINs" subtitle="Operate across multiple registrations. Every document is stamped with its branch."
        actions={<button className="btn-primary" onClick={() => setForm({})}><Plus size={16} /> New Branch</button>} />
      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table
            columns={[{ header: 'Code' }, { header: 'Name' }, { header: 'GSTIN' }, { header: 'State' }, { header: 'Status' }, { header: '' }]}
            rows={rows || []} empty="No branches."
            renderRow={(b) => (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">{b.code} {b.is_default && <Badge tone="green" className="ml-1">Default</Badge>}</td>
                <td className="td">{b.name}</td>
                <td className="td font-mono text-xs">{b.gstin || '—'}</td>
                <td className="td">{b.state_code || '—'}</td>
                <td className="td">{b.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}</td>
                <td className="td text-right">
                  <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setForm(b)}><Pencil size={12} /> Edit</button>
                  {!b.is_default && <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => makeDefault(b.id)}><Star size={12} /> Default</button>}
                </td>
              </>
            )}
          />
        )}
      </Card>
      {form && <BranchForm branch={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); refreshAll(); }} />}
    </div>
  );
}

function BranchForm({ branch, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => branch ? {
    code: branch.code, name: branch.name, gstin: branch.gstin || '', legalName: branch.legal_name || '', tradeName: branch.trade_name || '',
    addr1: branch.addr1 || '', place: branch.place || '', pincode: branch.pincode || '', stateCode: branch.state_code || '', phone: branch.phone || '', email: branch.email || '', isActive: branch.is_active,
  } : { code: '', name: '', gstin: '', legalName: '', tradeName: '', addr1: '', place: '', pincode: '', stateCode: '', phone: '', email: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    try {
      if (branch) await api.patch(`/gst/branches/${branch.id}`, f);
      else await api.post('/gst/branches', f);
      toast.success('Branch saved'); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={branch ? `Edit ${branch.code}` : 'New Branch / GSTIN'} size="lg"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Save'}</button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Branch Code" required><input className="input" value={f.code} onChange={set('code')} placeholder="BR01" /></Field>
        <Field label="Branch Name" required><input className="input" value={f.name} onChange={set('name')} placeholder="Pune Branch" /></Field>
        <Field label="GSTIN"><input className="input" value={f.gstin} onChange={set('gstin')} /></Field>
        <Field label="Legal Name"><input className="input" value={f.legalName} onChange={set('legalName')} /></Field>
        <Field label="Trade Name"><input className="input" value={f.tradeName} onChange={set('tradeName')} /></Field>
        <Field label="Address"><input className="input" value={f.addr1} onChange={set('addr1')} /></Field>
        <Field label="Place"><input className="input" value={f.place} onChange={set('place')} /></Field>
        <Field label="Pincode"><input className="input" value={f.pincode} onChange={set('pincode')} /></Field>
        <Field label="State Code"><input className="input" value={f.stateCode} onChange={set('stateCode')} placeholder="27" /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" value={f.email} onChange={set('email')} /></Field>
      </div>
    </Modal>
  );
}
