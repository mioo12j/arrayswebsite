import { useState } from 'react';
import { Plus, Hash, Loader2, Pencil, Trash2, Lock } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Table, Badge, Field } from '../components/ui/index.jsx';

export default function GstSeries() {
  const toast = useToast();
  const { data: rows, loading, refetch } = useFetch('/gst/number-series');
  const { data: branches } = useFetch('/gst/branches');
  const [form, setForm] = useState(null);

  const del = async (id) => { if (!window.confirm('Remove this numbering series?')) return; try { await api.delete(`/gst/number-series/${id}`); refetch(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div>
      <PageHeader title="Invoice Number Series" subtitle="FY-aware, branch-wise document numbering. Tokens: {BRANCH} {FY} {DOCTYPE} {SEQ}."
        actions={<button className="btn-primary" onClick={() => setForm({})}><Plus size={16} /> New Series</button>} />
      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table
            columns={[{ header: 'Branch' }, { header: 'Doc Type' }, { header: 'Template' }, { header: 'Next Preview' }, { header: 'FY Reset' }, { header: '' }]}
            rows={rows || []} empty="No series configured."
            renderRow={(s) => (
              <>
                <td className="td">{s.branch_code ? `${s.branch_code} — ${s.branch_name}` : <span className="text-slate-400">All branches</span>}</td>
                <td className="td"><Badge tone="blue">{s.doc_type}</Badge></td>
                <td className="td font-mono text-xs">{s.prefix}<span className="text-slate-400"> (pad {s.padding})</span></td>
                <td className="td font-mono font-semibold text-brand-600">{s.preview}</td>
                <td className="td">{s.fy_reset ? 'Yes' : 'No'}{s.is_locked && <Lock size={12} className="ml-1 inline text-amber-500" />}</td>
                <td className="td text-right">
                  <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setForm(s)}><Pencil size={12} /> Edit</button>
                  <button className="btn-ghost !py-1 !px-2 !text-xs text-red-500" onClick={() => del(s.id)}><Trash2 size={12} /></button>
                </td>
              </>
            )}
          />
        )}
      </Card>
      <Card className="mt-4 !p-4">
        <p className="text-sm text-slate-500"><Hash size={14} className="mr-1 inline" /> Example: template <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{'{BRANCH}/{FY}/'}</code> with padding 6 → <span className="font-mono font-semibold">BR01/25-26/000001</span>. New invoices with a blank document number are numbered automatically from the matching series.</p>
      </Card>
      {form && <SeriesForm series={form.id ? form : null} branches={branches || []} onClose={() => setForm(null)} onSaved={() => { setForm(null); refetch(); }} />}
    </div>
  );
}

function SeriesForm({ series, branches, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => series ? {
    branchId: series.branch_id || '', docType: series.doc_type, name: series.name || '', prefix: series.prefix, padding: series.padding, nextNumber: series.next_number, fyReset: series.fy_reset, isLocked: series.is_locked,
  } : { branchId: '', docType: 'INV', name: '', prefix: '{BRANCH}/{FY}/', padding: 6, nextNumber: 1, fyReset: true, isLocked: false });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, branchId: f.branchId || null, padding: Number(f.padding), nextNumber: Number(f.nextNumber) };
      if (series) await api.patch(`/gst/number-series/${series.id}`, body);
      else await api.post('/gst/number-series', body);
      toast.success('Series saved'); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={series ? 'Edit Series' : 'New Number Series'} size="lg"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Save'}</button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Branch" hint="Blank = applies to all branches"><select className="input" value={f.branchId} onChange={set('branchId')}><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></Field>
        <Field label="Document Type"><select className="input" value={f.docType} onChange={set('docType')}>{['INV', 'CRN', 'DBN', 'EWB'].map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <Field label="Template" hint="{BRANCH} {FY} {DOCTYPE} {SEQ}"><input className="input font-mono" value={f.prefix} onChange={set('prefix')} /></Field>
        <Field label="Zero Padding"><input className="input" type="number" value={f.padding} onChange={set('padding')} /></Field>
        <Field label="Next Number"><input className="input" type="number" value={f.nextNumber} onChange={set('nextNumber')} disabled={f.isLocked} /></Field>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.fyReset} onChange={set('fyReset')} /> Reset each FY</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isLocked} onChange={set('isLocked')} /> Lock rule</label>
        </div>
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">Preview: <span className="font-mono font-semibold text-brand-600">{previewOf(f, branches)}</span></div>
    </Modal>
  );
}

function previewOf(f, branches) {
  const fy = (() => { const d = new Date(); const y = d.getFullYear(); const s = d.getMonth() >= 3 ? y : y - 1; return `${String(s).slice(2)}-${String(s + 1).slice(2)}`; })();
  const code = branches.find((b) => b.id === f.branchId)?.code || '';
  const seq = String(f.nextNumber || 1).padStart(Number(f.padding) || 6, '0');
  let s = (f.prefix || '').replace(/\{BRANCH\}/gi, code).replace(/\{FY\}/gi, fy).replace(/\{DOCTYPE\}/gi, f.docType || '');
  return /\{SEQ\}/i.test(s) ? s.replace(/\{SEQ\}/gi, seq) : s + seq;
}
