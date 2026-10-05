import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, RotateCcw, XCircle, Copy } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { api, apiError } from '../api/client.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Loading, Table, Badge, EmptyState } from '../components/ui/index.jsx';
import { inr, fmtDate, titleCase } from '../lib/format.js';

const TYPE_LABEL = { rooftop: 'Rooftop', ground_mount: 'Ground Mount', industrial: 'Industrial', commercial: 'Commercial' };

export default function Quotes() {
  const navigate = useNavigate();
  const toast = useToast();
  const [trash, setTrash] = useState(false);
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [busy, setBusy] = useState('');
  const params = { ...filters, ...(trash ? { trash: '1' } : {}) };
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
  const { data: quotes, loading, refetch } = useFetch(`/quotes?${qs}`, [qs]);

  const softDelete = async (q) => {
    if (!window.confirm(`Move ${q.quote_number} to Trash? You can restore it later.`)) return;
    setBusy(q.id);
    try { await api.delete(`/quotes/${q.id}`); toast.success(`${q.quote_number} moved to Trash`); refetch(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  const restore = async (q) => {
    setBusy(q.id);
    try { await api.post(`/quotes/${q.id}/restore`); toast.success(`${q.quote_number} restored`); refetch(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };
  const purge = async (q) => {
    if (!window.confirm(`Permanently delete ${q.quote_number}? This cannot be undone.`)) return;
    setBusy(q.id);
    try { await api.delete(`/quotes/${q.id}?purge=1`); toast.success(`${q.quote_number} permanently deleted`); refetch(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };

  const duplicate = async (q) => {
    setBusy(q.id);
    try { const { data } = await api.post(`/quotes/${q.id}/duplicate`); toast.success(`Duplicated ${q.quote_number} → ${data.quote_number}`); navigate(`/quotes/${data.id}`); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(''); }
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div>
      <PageHeader
        title="Quotes & Estimation"
        subtitle="Prepare solar project quotations with full cost, margin and GST breakdown."
        actions={<button className="btn-primary" onClick={() => navigate('/quotes/new')}><Plus size={16} /> New Quotation</button>}
      />

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search quote number or client…" value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>
          <select className="input max-w-[180px]" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Any status</option>
            {['draft', 'sent', 'approved', 'rejected', 'revised', 'converted', 'expired'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
          <button
            className={`btn-ghost ${trash ? 'text-emerald-600' : 'text-slate-500'}`}
            onClick={() => setTrash((t) => !t)}
            title="Toggle Trash"
          >
            <Trash2 size={16} /> {trash ? 'Active quotes' : 'Trash'}
          </button>
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : !quotes?.length ? (
          <EmptyState
            title={trash ? 'Trash is empty' : 'No quotations yet'}
            hint={trash ? 'Deleted quotations appear here and can be restored.' : 'Create your first solar project quotation with the estimation calculator.'}
          />
        ) : (
          <Table
            columns={[
              { header: 'Quote #' }, { header: 'Client' }, { header: 'Type' }, { header: 'Size' },
              { header: 'Cost', align: 'right' }, { header: 'Margin', align: 'right' }, { header: 'Total', align: 'right' },
              { header: '₹/W' }, { header: trash ? 'Deleted' : 'Valid' }, { header: trash ? '' : 'Status' },
              { header: '', align: 'right' },
            ]}
            rows={quotes}
            onRowClick={(q) => (trash ? null : navigate(`/quotes/${q.id}`))}
            renderRow={(q) => (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">{q.quote_number}{q.version > 1 ? ` · R${q.version}` : ''}</td>
                <td className="td">{q.client_full_name || q.client_name || '—'}</td>
                <td className="td">{TYPE_LABEL[q.project_type] || q.project_type}</td>
                <td className="td">{q.capacity_kw} kW</td>
                <td className="td text-right text-slate-500">{inr(q.cost_amount, { compact: true })}</td>
                <td className="td text-right text-emerald-600">{inr(q.margin_amount, { compact: true })}</td>
                <td className="td text-right font-semibold">{inr(q.total_amount, { compact: true })}</td>
                <td className="td">{q.per_watt ? `₹${q.per_watt}` : '—'}</td>
                <td className="td whitespace-nowrap">{fmtDate(trash ? q.deleted_at : q.valid_until)}</td>
                <td className="td">{trash ? null : <Badge status={q.status} />}</td>
                <td className="td text-right whitespace-nowrap" onClick={stop}>
                  {trash ? (
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !px-2 text-emerald-600" disabled={busy === q.id} onClick={() => restore(q)} title="Restore">
                        <RotateCcw size={15} />
                      </button>
                      <button className="btn-ghost !px-2 text-rose-600" disabled={busy === q.id} onClick={() => purge(q)} title="Delete forever">
                        <XCircle size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !px-2 text-slate-400 hover:text-brand-600" disabled={busy === q.id} onClick={() => duplicate(q)} title="Duplicate">
                        <Copy size={15} />
                      </button>
                      <button className="btn-ghost !px-2 text-slate-400 hover:text-rose-600" disabled={busy === q.id} onClick={() => softDelete(q)} title="Move to Trash">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </td>
              </>
            )}
          />
        )}
      </Card>
    </div>
  );
}
