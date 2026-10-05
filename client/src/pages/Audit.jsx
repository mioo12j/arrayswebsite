import { useState } from 'react';
import { useFetch } from '../lib/useFetch.js';
import { PageHeader, Card, Loading, Table, Badge } from '../components/ui/index.jsx';
import { fmtDateTime } from '../lib/format.js';

const ACTION_TONE = { create: 'green', update: 'blue', delete: 'red', login: 'slate', upload: 'purple', reconcile: 'amber' };

export default function Audit() {
  const [filters, setFilters] = useState({ entity: '', action: '' });
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString();
  const { data: logs, loading } = useFetch(`/audit?${qs}`, [qs]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Every create, update, upload and reconciliation action is recorded for accountability." />

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap gap-2">
          <select className="input max-w-[200px]" value={filters.entity} onChange={(e) => setFilters((f) => ({ ...f, entity: e.target.value }))}>
            <option value="">All modules</option>
            {['payments', 'receipts', 'invoices', 'vendors', 'clients', 'projects', 'sites', 'bank_statements', 'bank_statement_lines', 'users'].map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select className="input max-w-[160px]" value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}>
            <option value="">All actions</option>
            {Object.keys(ACTION_TONE).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table
            columns={[{ header: 'Time' }, { header: 'User' }, { header: 'Action' }, { header: 'Module' }, { header: 'Entity ID' }, { header: 'Changes' }]}
            rows={logs || []}
            empty="No audit activity yet."
            renderRow={(l) => (
              <>
                <td className="td whitespace-nowrap text-slate-500">{fmtDateTime(l.created_at)}</td>
                <td className="td font-medium">{l.user_name || 'System'}</td>
                <td className="td"><Badge tone={ACTION_TONE[l.action] || 'slate'}>{l.action}</Badge></td>
                <td className="td capitalize">{(l.entity || '').replace(/_/g, ' ')}</td>
                <td className="td font-mono text-xs text-slate-400">{l.entity_id ? String(l.entity_id).slice(0, 8) : '—'}</td>
                <td className="td max-w-[260px] truncate text-xs text-slate-500" title={l.changes ? JSON.stringify(l.changes) : ''}>
                  {l.changes ? JSON.stringify(l.changes).slice(0, 80) : '—'}
                </td>
              </>
            )}
          />
        )}
      </Card>
    </div>
  );
}
