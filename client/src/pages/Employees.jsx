import { useState } from 'react';
import { Plus, Search, Loader2, ChevronRight } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Table, Badge, Field } from '../components/ui/index.jsx';
import { inr } from '../lib/format.js';

export default function Employees() {
  const toast = useToast();
  const { data: employees, loading, refetch } = useFetch('/employees');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = (employees || []).filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Employee-wise ledgers for salaries, labour and advances paid out."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New Employee</button>}
      />

      <Card className="mb-4 !p-3">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table
            columns={[
              { header: 'Employee' }, { header: 'Designation' }, { header: 'Department' },
              { header: 'Total Paid', align: 'right' }, { header: 'Balance', align: 'right' }, { header: 'Status' }, { header: '' },
            ]}
            rows={filtered}
            empty="No employees yet."
            onRowClick={(e) => (window.location.href = `/employees/${e.id}`)}
            renderRow={(e) => (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">{e.name}</td>
                <td className="td">{e.designation || '—'}</td>
                <td className="td">{e.department || '—'}</td>
                <td className="td text-right">{inr(e.total_paid)}</td>
                <td className="td text-right font-semibold text-amber-600">{inr(e.balance)}</td>
                <td className="td"><Badge tone={e.is_active ? 'green' : 'slate'}>{e.is_active ? 'Active' : 'Inactive'}</Badge></td>
                <td className="td text-right"><ChevronRight size={16} className="text-slate-300" /></td>
              </>
            )}
          />
        )}
      </Card>

      {open && <EmployeeModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refetch(); toast.success('Employee created'); }} />}
    </div>
  );
}

function EmployeeModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', employee_code: '', designation: '', department: '', phone: '', email: '', bank_account: '', ifsc: '', opening_balance: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return toast.error('Employee name is required');
    setSaving(true);
    try {
      await api.post('/employees', { ...form, opening_balance: Number(form.opening_balance || 0) });
      onSaved();
    } catch (err) { toast.error(apiError(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="New Employee"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Create Employee'}</button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full Name" required><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="Employee Code"><input className="input" value={form.employee_code} onChange={set('employee_code')} /></Field>
        <Field label="Designation"><input className="input" value={form.designation} onChange={set('designation')} /></Field>
        <Field label="Department"><input className="input" value={form.department} onChange={set('department')} placeholder="Site / Office / Labour" /></Field>
        <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" value={form.email} onChange={set('email')} /></Field>
        <Field label="Bank Account"><input className="input" value={form.bank_account} onChange={set('bank_account')} /></Field>
        <Field label="IFSC"><input className="input" value={form.ifsc} onChange={set('ifsc')} /></Field>
        <Field label="Opening Balance" hint="Amount currently owed to this employee"><input className="input" type="number" step="0.01" value={form.opening_balance} onChange={set('opening_balance')} /></Field>
      </div>
    </Modal>
  );
}
