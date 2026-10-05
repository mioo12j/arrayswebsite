import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileDown, UserRound } from 'lucide-react';
import { download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { Card, Loading, Table, Badge } from '../components/ui/index.jsx';
import { inr, fmtDate } from '../lib/format.js';

export default function EmployeeLedger() {
  const { id } = useParams();
  const { data, loading } = useFetch(`/employees/${id}/ledger`);
  if (loading) return <Loading />;
  if (!data) return null;
  const { employee, summary, entries } = data;

  return (
    <div>
      <Link to="/employees" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600">
        <ArrowLeft size={16} /> Back to employees
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600 text-white"><UserRound size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{employee.name}</h1>
            <p className="text-sm text-slate-500">{employee.designation || 'Employee'}{employee.department ? ` · ${employee.department}` : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => download(`/reports/employee-ledger/${id}?format=xlsx`)}><FileDown size={16} /> Excel</button>
          <button className="btn-ghost" onClick={() => download(`/reports/employee-ledger/${id}?format=pdf`)}><FileDown size={16} /> PDF</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Total Paid</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{inr(summary.total_paid)}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Opening Balance</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{inr(employee.opening_balance)}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Balance</p><p className="mt-1 text-2xl font-bold text-amber-600">{inr(summary.balance)}</p></Card>
      </div>

      <Card className="!p-0">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Ledger Entries</h3>
        </div>
        <Table
          columns={[
            { header: 'Date' }, { header: 'Description' }, { header: 'Project' }, { header: 'Type' },
            { header: 'Paid', align: 'right' }, { header: 'Credit', align: 'right' }, { header: 'Balance', align: 'right' },
          ]}
          rows={entries}
          empty="No ledger activity yet."
          renderRow={(e) => (
            <>
              <td className="td whitespace-nowrap">{fmtDate(e.entry_date)}</td>
              <td className="td">{e.description || '—'}</td>
              <td className="td">{e.project_name || '—'}</td>
              <td className="td"><Badge tone={e.direction === 'debit' ? 'red' : 'green'}>{e.direction === 'debit' ? 'Paid' : 'Credit'}</Badge></td>
              <td className="td text-right">{e.direction === 'debit' ? inr(e.amount) : '—'}</td>
              <td className="td text-right">{e.direction === 'credit' ? inr(e.amount) : '—'}</td>
              <td className="td text-right font-semibold">{inr(e.running_balance)}</td>
            </>
          )}
        />
      </Card>
    </div>
  );
}
