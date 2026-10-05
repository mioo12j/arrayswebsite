import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, ChevronRight } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Badge, Field, EmptyState } from '../components/ui/index.jsx';
import { inr, fmtDate } from '../lib/format.js';

export default function Projects() {
  const toast = useToast();
  const { data: projects, loading, refetch } = useFetch('/projects');
  const { data: clients } = useFetch('/clients');
  const [open, setOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Projects & Sites"
        subtitle="Project hierarchy with site-wise expenditure and profitability."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New Project</button>}
      />

      {loading ? <Loading /> : !projects?.length ? (
        <Card><EmptyState title="No projects yet" hint="Create your first project to start linking payments, receipts and invoices." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const spent = Number(p.total_spent || 0);
            const budget = Number(p.budget || 0);
            const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            const over = budget > 0 && spent > budget;
            return (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card className="h-full transition hover:shadow-soft">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">{p.name}</h3>
                      <p className="text-xs text-slate-400">{p.client_full_name || p.client_name || 'No client'}{p.location ? ` · ${p.location}` : ''}</p>
                    </div>
                    <Badge status={p.status} />
                  </div>

                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Spent vs Budget</span>
                      <span className={over ? 'font-semibold text-red-600' : 'text-slate-500'}>{inr(spent, { compact: true })} / {inr(budget, { compact: true })}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-[11px] uppercase text-slate-400">Received</p><p className="text-sm font-semibold text-emerald-600">{inr(p.total_received, { compact: true })}</p></div>
                    <div><p className="text-[11px] uppercase text-slate-400">Sites</p><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{p.site_count}</p></div>
                    <div><p className="text-[11px] uppercase text-slate-400">Capacity</p><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{p.capacity_kw ? `${p.capacity_kw}kW` : '—'}</p></div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {open && <ProjectModal clients={clients} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refetch(); toast.success('Project created'); }} />}
    </div>
  );
}

export function ProjectModal({ onClose, onSaved, clients, initial }) {
  const toast = useToast();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    name: initial?.name || '', code: initial?.code || '', client_id: initial?.client_id || '',
    capacity_kw: initial?.capacity_kw ?? '', budget: initial?.budget ?? '', contract_value: initial?.contract_value ?? '',
    location: initial?.location || '', po_number: initial?.po_number || '', po_date: initial?.po_date?.slice(0, 10) || '',
    start_date: initial?.start_date?.slice(0, 10) || '', end_date: initial?.end_date?.slice(0, 10) || '',
    status: initial?.status || 'active', notes: initial?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return toast.error('Project name is required');
    setSaving(true);
    try {
      const body = {
        ...form,
        client_id: form.client_id || null,
        capacity_kw: form.capacity_kw ? Number(form.capacity_kw) : null,
        budget: Number(form.budget || 0), contract_value: Number(form.contract_value || 0),
        po_date: form.po_date || null, start_date: form.start_date || null, end_date: form.end_date || null,
      };
      if (isEdit) await api.patch(`/projects/${initial.id}`, body); else await api.post('/projects', body);
      onSaved();
    } catch (err) { toast.error(apiError(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Project' : 'New Project'} size="lg"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : isEdit ? 'Save Changes' : 'Create Project'}</button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Project Name" required><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="Project Code"><input className="input" value={form.code} onChange={set('code')} placeholder="PRJ-001" /></Field>
        <Field label="Client">
          <select className="input" value={form.client_id} onChange={set('client_id')}>
            <option value="">Select client</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Capacity (kW)"><input className="input" type="number" step="0.01" value={form.capacity_kw} onChange={set('capacity_kw')} /></Field>
        <Field label="PO Number"><input className="input" value={form.po_number} onChange={set('po_number')} placeholder="Mar/004" /></Field>
        <Field label="PO Date"><input className="input" type="date" value={form.po_date} onChange={set('po_date')} /></Field>
        <Field label="Budget"><input className="input" type="number" step="0.01" value={form.budget} onChange={set('budget')} /></Field>
        <Field label="Contract Value"><input className="input" type="number" step="0.01" value={form.contract_value} onChange={set('contract_value')} /></Field>
        <Field label="Location"><input className="input" value={form.location} onChange={set('location')} /></Field>
        {isEdit && (
          <Field label="Status">
            <select className="input" value={form.status} onChange={set('status')}>
              {['active', 'on_hold', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </Field>
        )}
        <Field label="Start Date"><input className="input" type="date" value={form.start_date} onChange={set('start_date')} /></Field>
        <Field label="End Date"><input className="input" type="date" value={form.end_date} onChange={set('end_date')} /></Field>
      </div>
      <div className="mt-4"><Field label="Notes"><textarea className="input min-h-[60px]" value={form.notes} onChange={set('notes')} /></Field></div>
    </Modal>
  );
}
