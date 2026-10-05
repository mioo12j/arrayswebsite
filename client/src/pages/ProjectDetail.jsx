import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Loader2, FileDown, MapPin, Pencil, CheckCircle2, Circle, Trash2, ListChecks, ClipboardList } from 'lucide-react';
import { api, apiError, download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, Loading, Badge, Table, Field } from '../components/ui/index.jsx';
import { inr, fmtDate } from '../lib/format.js';
import { ProjectModal } from './Projects.jsx';

export default function ProjectDetail() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: project, loading, refetch } = useFetch(`/projects/${id}`);
  const { data: clients } = useFetch('/clients');
  const [open, setOpen] = useState(false);
  const [editProject, setEditProject] = useState(false);
  const [editSite, setEditSite] = useState(null);
  const [busy, setBusy] = useState(false);

  const setStatus = async (status) => {
    setBusy(true);
    try { await api.patch(`/projects/${id}`, { status }); refetch(); toast.success(status === 'completed' ? 'Project marked complete' : 'Project reopened'); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm('Delete this project? It moves to the Recovery Center (recoverable for 30 days). Its sites and payment terms go with it; linked payments and invoices are kept but unlinked.')) return;
    setBusy(true);
    try { await api.delete(`/projects/${id}`); toast.success('Project moved to Recovery Center'); navigate('/projects'); }
    catch (e) { toast.error(apiError(e)); setBusy(false); }
  };

  if (loading) return <Loading />;
  if (!project) return null;

  const margin = Number(project.gross_margin || 0);
  const done = project.status === 'completed';

  return (
    <div>
      <Link to="/projects" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600">
        <ArrowLeft size={16} /> Back to projects
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{project.name}</h1>
            <Badge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">{project.client_full_name || project.client_name || 'No client'}{project.location ? ` · ${project.location}` : ''}{project.capacity_kw ? ` · ${project.capacity_kw} kW` : ''}</p>
          {(project.po_number || project.po_date) && <p className="mt-0.5 text-xs text-slate-400">PO: {project.po_number || '—'}{project.po_date ? ` · ${fmtDate(project.po_date)}` : ''}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => setEditProject(true)}><Pencil size={16} /> Edit</button>
          {done
            ? <button className="btn-ghost" onClick={() => setStatus('active')} disabled={busy}><Circle size={16} /> Reopen</button>
            : <button className="btn-ghost !text-emerald-600" onClick={() => setStatus('completed')} disabled={busy}><CheckCircle2 size={16} /> Mark Complete</button>}
          <button className="btn-ghost" onClick={() => download('/reports/projects?format=xlsx')}><FileDown size={16} /> Profitability Report</button>
          <button className="btn-ghost !text-red-600" onClick={del} disabled={busy}><Trash2 size={16} /> Delete</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Contract</p><p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{inr(project.contract_value, { compact: true })}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Budget</p><p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{inr(project.budget, { compact: true })}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Spent</p><p className="mt-1 text-xl font-bold text-red-600">{inr(project.total_spent, { compact: true })}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Received</p><p className="mt-1 text-xl font-bold text-emerald-600">{inr(project.total_received, { compact: true })}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Gross Margin</p><p className={`mt-1 text-xl font-bold ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{inr(margin, { compact: true })}</p></Card>
      </div>

      {project.quote && <QuoteScopeCard quote={project.quote} />}

      <Card className="!p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Sites</h3>
          <button className="btn-primary !py-1.5 !text-xs" onClick={() => setOpen(true)}><Plus size={14} /> Add Site</button>
        </div>
        <Table
          columns={[{ header: 'Site' }, { header: 'Location' }, { header: 'Capacity', align: 'right' }, { header: 'PO No.' }, { header: 'Budget', align: 'right' }, { header: 'Spent', align: 'right' }, { header: 'Status' }, { header: '' }]}
          rows={project.sites || []}
          empty="No sites added yet."
          renderRow={(s) => (
            <>
              <td className="td font-medium text-slate-800 dark:text-slate-100">
                <button className="hover:underline" onClick={() => setEditSite(s)}>{s.name}</button>
              </td>
              <td className="td">{s.latitude && s.longitude ? <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-slate-400" />{s.location || `${s.latitude}, ${s.longitude}`}</span> : s.location || '—'}</td>
              <td className="td text-right">{s.capacity_kw ? `${s.capacity_kw} kW` : '—'}</td>
              <td className="td text-sm text-slate-500">{s.po_number || '—'}</td>
              <td className="td text-right">{inr(s.budget)}</td>
              <td className="td text-right font-semibold text-red-600">{inr(s.site_spent)}</td>
              <td className="td"><Badge status={s.status} /></td>
              <td className="td text-right"><button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setEditSite(s)}><Pencil size={13} /></button></td>
            </>
          )}
        />
      </Card>

      <PaymentTermsCard project={project} refetch={refetch} />

      {open && <SiteModal projectId={id} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refetch(); toast.success('Site added'); }} />}
      {editSite && <SiteModal projectId={id} initial={editSite} onClose={() => setEditSite(null)} onSaved={() => { setEditSite(null); refetch(); toast.success('Site updated'); }} />}
      {editProject && <ProjectModal clients={clients} initial={project} onClose={() => setEditProject(false)} onSaved={() => { setEditProject(false); refetch(); toast.success('Project updated'); }} />}
    </div>
  );
}

// ── Quotation & scope — the agreed system config, priced BOQ, money & savings ─
function QuoteScopeCard({ quote }) {
  const [showBoq, setShowBoq] = useState(false);
  const pi = quote.proposal_inputs || {};
  const items = Array.isArray(quote.line_items) ? quote.line_items : [];
  const supply = (v) => (v === 'client' ? '  ·  free-issue by client (I&C only)' : '');
  const cfg = [
    ['Solar Module', (pi.module_config || '545 Wp Mono PERC / latest equivalent') + supply(pi.module_supply)],
    pi.panel_type ? ['Panel Type', pi.panel_type] : null,
    ['Inverter', (pi.inverter_config || 'Three-phase grid-connected string inverter') + supply(pi.inverter_supply)],
    Number(pi.dc_capacity) ? ['DC Capacity', `${pi.dc_capacity} kWp`] : null,
    ['Mounting (MMS)', pi.mms_config || 'Aluminium / GI structure suitable for rooftop'],
    ['System', pi.system_config || 'Grid-connected rooftop solar system'],
    ['Net Metering', pi.net_metering === 'included' ? 'Included' : 'Not included'],
    ['Battery Backup', pi.battery_backup === 'included' ? 'Included' : 'Not included'],
  ].filter(Boolean);
  const money = [
    ['Subtotal (basic cost)', quote.subtotal],
    ['Margin', quote.margin_amount],
    ['Taxable value (basic)', quote.taxable_amount, `₹${quote.per_watt_basic}/W`],
    ['GST', quote.gst_amount],
    ['Grand Total (incl. GST)', quote.total_amount, quote.per_watt ? `₹${quote.per_watt}/W` : null],
  ];

  return (
    <Card className="mb-6 !p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <ClipboardList size={16} /> Quotation &amp; Scope
          <span className="text-xs font-normal text-slate-400">from {quote.quote_number}{quote.version > 1 ? ` · R${quote.version}` : ''}</span>
        </h3>
        <div className="flex items-center gap-2">
          <Link to={`/quotes/${quote.id}`} className="btn-ghost !py-1.5 !text-xs"><Pencil size={13} /> Open quote</Link>
          <button className="btn-ghost !py-1.5 !text-xs" onClick={() => download(`/quotes/${quote.id}/document.pdf`)}><FileDown size={13} /> Documents</button>
        </div>
      </div>

      <div className="grid gap-px bg-slate-100 dark:bg-slate-800 md:grid-cols-2">
        {/* System configuration */}
        <div className="bg-white p-5 dark:bg-slate-900">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">System Configuration</p>
          <dl className="space-y-1.5">
            {cfg.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-sm">
                <dt className="shrink-0 text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-700 dark:text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {/* Financials + savings */}
        <div className="bg-white p-5 dark:bg-slate-900">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Priced Offer</p>
          <dl className="space-y-1.5">
            {money.map(([k, v, sub]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-700 dark:text-slate-200">{inr(v)}{sub && <span className="ml-1 text-xs font-normal text-slate-400">{sub}</span>}</dd>
              </div>
            ))}
          </dl>
          {Number(quote.annual_savings) > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div><p className="text-[10px] font-semibold uppercase text-slate-400">Annual Savings</p><p className="text-sm font-bold text-emerald-600">{inr(quote.annual_savings, { compact: true })}</p></div>
              <div><p className="text-[10px] font-semibold uppercase text-slate-400">Payback</p><p className="text-sm font-bold text-slate-700 dark:text-slate-200">{quote.payback_years} yrs</p></div>
              <div><p className="text-[10px] font-semibold uppercase text-slate-400">25-yr Savings</p><p className="text-sm font-bold text-slate-700 dark:text-slate-200">{inr(quote.lifetime_savings, { compact: true })}</p></div>
            </div>
          )}
        </div>
      </div>

      {/* Priced BOQ — on demand */}
      {items.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          <button className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50" onClick={() => setShowBoq((s) => !s)}>
            <span>Priced Bill of Quantities — {items.length} items</span>
            <span className="text-xs text-brand-600">{showBoq ? 'Hide' : 'View'}</span>
          </button>
          {showBoq && (
            <div className="overflow-x-auto px-5 pb-4">
              <table className="min-w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-1.5">Description</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5 pl-2">Unit</th><th className="py-1.5 pl-2 text-right">Rate</th><th className="py-1.5 pl-2 text-right">Amount (basic)</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{it.item}</td>
                      <td className="py-1.5 text-right text-slate-500">{it.qty}</td>
                      <td className="py-1.5 pl-2 text-slate-500">{it.unit}</td>
                      <td className="py-1.5 pl-2 text-right text-slate-500">{inr(it.rate)}</td>
                      <td className="py-1.5 pl-2 text-right font-medium text-slate-700 dark:text-slate-200">{inr(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Payment terms / milestone schedule with a tick-off checklist ────────────
function PaymentTermsCard({ project, refetch }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');
  const terms = project.payment_terms || [];
  const sum = project.terms_summary || { total: 0, due_released: 0, released: 0, pending_release: 0 };

  const patch = async (termId, body, ok) => {
    setBusy(termId);
    try { await api.patch(`/projects/payment-terms/${termId}`, body); refetch(); if (ok) toast.success(ok); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  const toggleDone = (t) => patch(t.id, { is_done: !t.is_done }, !t.is_done ? 'Marked complete' : 'Marked pending');
  const setReleased = (t) => {
    const v = window.prompt(`Amount released so far for "${t.title}" (due ${inr(t.due_amount)}):`, t.released_amount || '');
    if (v == null) return;
    patch(t.id, { released_amount: Number(v) || 0 }, 'Released amount updated');
  };
  const del = async (t) => {
    if (!window.confirm(`Delete payment term "${t.title}"?`)) return;
    setBusy(t.id);
    try { await api.delete(`/projects/payment-terms/${t.id}`); refetch(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };

  return (
    <Card className="mt-6 !p-0">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><ListChecks size={16} /> Payment Terms &amp; Progress</h3>
        <button className="btn-primary !py-1.5 !text-xs" onClick={() => setAdding(true)}><Plus size={14} /> Add Term</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800 lg:grid-cols-4">
        <Mini label="Scheduled (all terms)" value={inr(sum.total)} />
        <Mini label="Work done → due" value={inr(sum.due_released)} tone="text-amber-600" />
        <Mini label="Released so far" value={inr(sum.released)} tone="text-emerald-600" />
        <Mini label="Pending to release" value={inr(sum.pending_release)} tone={sum.pending_release > 0 ? 'text-red-600' : 'text-slate-500'} />
      </div>

      {!terms.length ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          No payment terms yet. Add stages like “30% on material delivery”, “50% on installation”, “20% on commissioning”.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {terms.map((t) => {
            const fullyReleased = Number(t.released_amount || 0) >= Number(t.due_amount || 0) && Number(t.due_amount || 0) > 0;
            return (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <button onClick={() => toggleDone(t)} disabled={busy === t.id} title={t.is_done ? 'Mark pending' : 'Mark work complete'} className="shrink-0">
                  {busy === t.id ? <Loader2 className="animate-spin text-slate-400" size={20} /> : t.is_done ? <CheckCircle2 className="text-emerald-600" size={20} /> : <Circle className="text-slate-300 hover:text-slate-400" size={20} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${t.is_done ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {t.amount != null ? 'Fixed' : `${Number(t.percent || 0)}% of contract`} · Due <b className="text-slate-600 dark:text-slate-300">{inr(t.due_amount)}</b>
                    {t.is_done && <span className="ml-1 text-amber-600">· should be released</span>}
                    {t.notes ? ` · ${t.notes}` : ''}
                  </p>
                </div>
                <button className="shrink-0 text-right" onClick={() => setReleased(t)} title="Set released amount">
                  <span className={`text-sm font-semibold ${fullyReleased ? 'text-emerald-600' : Number(t.released_amount || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{inr(t.released_amount)}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-slate-400">released</span>
                </button>
                <Badge tone={fullyReleased ? 'green' : t.is_done ? 'amber' : 'slate'}>{fullyReleased ? 'Paid' : t.is_done ? 'Due' : 'Pending'}</Badge>
                <button className="shrink-0 text-slate-300 hover:text-red-500" onClick={() => del(t)}><Trash2 size={15} /></button>
              </li>
            );
          })}
        </ul>
      )}

      {adding && <TermModal projectId={project.id} contractValue={project.contract_value} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refetch(); toast.success('Payment term added'); }} />}
    </Card>
  );
}

function Mini({ label, value, tone }) {
  return (
    <div className="bg-white px-4 py-3 dark:bg-slate-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${tone || 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
    </div>
  );
}

function TermModal({ projectId, contractValue, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', basis: 'percent', percent: '', amount: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const preview = form.basis === 'percent' ? (Number(form.percent || 0) / 100) * Number(contractValue || 0) : Number(form.amount || 0);

  const save = async () => {
    if (!form.title.trim()) return toast.error('Enter a milestone description');
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/payment-terms`, {
        title: form.title.trim(),
        percent: form.basis === 'percent' ? Number(form.percent || 0) : null,
        amount: form.basis === 'amount' ? Number(form.amount || 0) : null,
        notes: form.notes || null,
      });
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Add Payment Term"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Add Term'}</button>
      </>}>
      <div className="space-y-4">
        <Field label="Milestone / work completed" required>
          <input className="input" value={form.title} onChange={set('title')} placeholder="e.g. 30% on material delivery at site" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Basis">
            <select className="input" value={form.basis} onChange={set('basis')}>
              <option value="percent">% of contract value</option>
              <option value="amount">Fixed amount</option>
            </select>
          </Field>
          {form.basis === 'percent'
            ? <Field label="Percent (%)"><input className="input" type="number" step="0.01" value={form.percent} onChange={set('percent')} placeholder="30" /></Field>
            : <Field label="Amount (₹)"><input className="input" type="number" step="0.01" value={form.amount} onChange={set('amount')} /></Field>}
        </div>
        <p className="text-xs text-slate-500">Due amount for this stage: <b className="text-slate-700 dark:text-slate-200">{inr(preview)}</b>{form.basis === 'percent' && ` (of ${inr(contractValue)} contract)`}</p>
        <Field label="Notes (optional)"><input className="input" value={form.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

function SiteModal({ projectId, onClose, onSaved, initial }) {
  const toast = useToast();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    name: initial?.name || '', code: initial?.code || '', location: initial?.location || '',
    capacity_kw: initial?.capacity_kw ?? '', po_number: initial?.po_number || '', po_date: initial?.po_date?.slice(0, 10) || '',
    latitude: initial?.latitude ?? '', longitude: initial?.longitude ?? '', budget: initial?.budget ?? '', status: initial?.status || 'active',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return toast.error('Site name is required');
    setSaving(true);
    try {
      const body = {
        ...form,
        capacity_kw: form.capacity_kw ? Number(form.capacity_kw) : null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        budget: Number(form.budget || 0), po_date: form.po_date || null,
      };
      if (isEdit) await api.patch(`/sites/${initial.id}`, body); else await api.post(`/projects/${projectId}/sites`, body);
      onSaved();
    } catch (err) { toast.error(apiError(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Site' : 'Add Site'}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : isEdit ? 'Save Changes' : 'Add Site'}</button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Site Name" required><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="Site Code"><input className="input" value={form.code} onChange={set('code')} /></Field>
        <Field label="Location"><input className="input" value={form.location} onChange={set('location')} /></Field>
        <Field label="Capacity (kW)"><input className="input" type="number" step="0.01" value={form.capacity_kw} onChange={set('capacity_kw')} /></Field>
        <Field label="PO Number"><input className="input" value={form.po_number} onChange={set('po_number')} /></Field>
        <Field label="PO Date"><input className="input" type="date" value={form.po_date} onChange={set('po_date')} /></Field>
        <Field label="Budget"><input className="input" type="number" step="0.01" value={form.budget} onChange={set('budget')} /></Field>
        {isEdit && (
          <Field label="Status">
            <select className="input" value={form.status} onChange={set('status')}>
              {['active', 'on_hold', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </Field>
        )}
        <Field label="Latitude"><input className="input" value={form.latitude} onChange={set('latitude')} /></Field>
        <Field label="Longitude"><input className="input" value={form.longitude} onChange={set('longitude')} /></Field>
      </div>
    </Modal>
  );
}
