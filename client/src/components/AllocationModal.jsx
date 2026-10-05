import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from './ui/Toast.jsx';
import Modal from './ui/Modal.jsx';
import { Field } from './ui/index.jsx';
import { inr } from '../lib/format.js';

const OTHER = '__other__';
const blankRow = () => ({ project_id: '', second_id: '', description: '', amount: '' });
const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

// kind: 'incoming' (receipt → project + milestone) | 'outgoing' (payment → project + site)
export default function AllocationModal({ kind, id, amount, meta = {}, onClose, onSaved }) {
  const toast = useToast();
  const base = kind === 'incoming' ? 'receipts' : 'payments';
  const secondLabel = kind === 'incoming' ? 'Milestone' : 'Site';
  const { data: projects } = useFetch('/projects');
  const { data: sites } = useFetch('/sites');
  const [milestones, setMilestones] = useState({});         // {projectId: [terms]}
  const [rows, setRows] = useState([blankRow()]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Load any existing allocations.
  useEffect(() => {
    let on = true;
    api.get(`/${base}/${id}/allocations`).then(({ data }) => {
      if (!on) return;
      const second = (a) => (kind === 'incoming' ? a.milestone_id : a.site_id);
      const mapped = (data || []).map((a) => ({
        project_id: a.project_id || (second(a) ? '' : OTHER),   // no project & no milestone/site → "Other"
        second_id: second(a) || '',
        description: a.description || '',
        amount: a.amount != null ? String(Number(a.amount)) : '',
      }));
      setRows(mapped.length ? mapped : [blankRow()]);
    }).catch((e) => toast.error(apiError(e))).finally(() => on && setLoading(false));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Lazily fetch a project's milestones (incoming only).
  const loadMilestones = (pid) => {
    if (kind !== 'incoming' || !pid || pid === OTHER || milestones[pid]) return;
    api.get(`/projects/${pid}/payment-terms`).then(({ data }) => setMilestones((m) => ({ ...m, [pid]: data || [] }))).catch(() => {});
  };
  useEffect(() => { rows.forEach((r) => loadMilestones(r.project_id)); /* eslint-disable-next-line */ }, [rows, projects]);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const delRow = (i) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blankRow()]));

  const total = useMemo(() => r2(rows.reduce((s, r) => s + Number(r.amount || 0), 0)), [rows]);
  const remaining = r2(Number(amount || 0) - total);
  const over = remaining < -0.001;
  const balanced = Math.abs(remaining) < 0.01;
  const hasAny = rows.some((r) => Number(r.amount || 0) > 0 || r.project_id || r.description.trim());

  const save = async () => {
    // allow "clear all" (no rows with data); otherwise must balance and not exceed
    if (hasAny) {
      if (over) return toast.error('Allocations exceed the payment amount.');
      if (!balanced) return toast.error(`₹${inr(Math.abs(remaining)).replace('Rs ', '')} still unallocated — total must equal the payment amount.`);
      for (const r of rows) {
        if (Number(r.amount || 0) > 0 && r.project_id === OTHER && !r.description.trim()) return toast.error('Enter a description for the "Other" line.');
      }
    }
    setBusy(true);
    try {
      const items = rows
        .filter((r) => Number(r.amount || 0) > 0 || r.project_id || r.description.trim())
        .map((r) => ({
          project_id: r.project_id && r.project_id !== OTHER ? r.project_id : null,
          milestone_id: kind === 'incoming' && r.project_id !== OTHER ? (r.second_id || null) : null,
          site_id: kind === 'outgoing' && r.project_id !== OTHER ? (r.second_id || null) : null,
          description: r.description.trim() || null,
          amount: Number(r.amount || 0),
        }));
      await api.put(`/${base}/${id}/allocations`, { items });
      toast.success('Allocation saved');
      onSaved?.();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="xl" title="Edit Allocation"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy || loading}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Allocation</button>
      </>}>
      {/* Locked transaction facts */}
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/50 md:grid-cols-4">
        <Locked label="Amount" value={inr(amount)} strong />
        <Locked label="Reference" value={meta.reference || '—'} />
        <Locked label="Date" value={meta.date || '—'} />
        <Locked label={kind === 'incoming' ? 'Party' : 'Vendor'} value={meta.party || '—'} />
      </div>
      <p className="mb-2 text-xs text-slate-500">Tag this transaction to projects{kind === 'incoming' ? ' / milestones' : ' / sites'}, or choose <b>Other</b> for unrelated items. Financial details above are locked.</p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50"><tr>
            <th className="px-2 py-1.5 text-left">Project</th>
            <th className="px-2 py-1.5 text-left">{secondLabel}</th>
            <th className="px-2 py-1.5 text-left">Description</th>
            <th className="px-2 py-1.5 text-right">Amount</th><th></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => {
              const isOther = r.project_id === OTHER;
              const siteOpts = (sites || []).filter((s) => s.project_id === r.project_id);
              const msOpts = milestones[r.project_id] || [];
              return (
                <tr key={i}>
                  <td className="px-1 py-1">
                    <select className="input !py-1 !text-sm min-w-[150px]" value={r.project_id}
                      onChange={(e) => setRow(i, { project_id: e.target.value, second_id: '' })}>
                      <option value="">— select —</option>
                      {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      <option value={OTHER}>Other (custom)</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    {isOther || !r.project_id ? <span className="text-xs text-slate-400">—</span> : (
                      <select className="input !py-1 !text-sm min-w-[130px]" value={r.second_id} onChange={(e) => setRow(i, { second_id: e.target.value })}>
                        <option value="">— none —</option>
                        {(kind === 'incoming' ? msOpts : siteOpts).map((o) => <option key={o.id} value={o.id}>{kind === 'incoming' ? o.title : o.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <input className="input !py-1 !text-sm min-w-[160px]" value={r.description}
                      onChange={(e) => setRow(i, { description: e.target.value })}
                      placeholder={isOther ? 'Describe this expense/collection' : 'Optional note'} />
                  </td>
                  <td className="px-1 py-1"><input type="number" className="input !py-1 !text-sm w-28 text-right" value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} /></td>
                  <td className="px-1 py-1"><button className="text-slate-400 hover:text-red-500" onClick={() => delRow(i)}><Trash2 size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost !py-1 !text-xs" onClick={addRow}><Plus size={13} /> Add line</button>
        <div className="flex items-center gap-5 text-sm">
          <span className="text-slate-500">Allocated <b className="text-slate-800 dark:text-slate-100">{inr(total)}</b></span>
          <span className={over ? 'font-semibold text-red-600' : balanced ? 'font-semibold text-emerald-600' : 'text-amber-600'}>
            {over ? `Over by ${inr(-remaining)}` : balanced ? 'Balanced ✓' : `Remaining ${inr(remaining)}`}
          </span>
        </div>
      </div>
    </Modal>
  );
}

function Locked({ label, value, strong }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label} <span className="text-slate-300">🔒</span></p>
      <p className={`${strong ? 'text-base font-bold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>{value}</p>
    </div>
  );
}
