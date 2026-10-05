import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileDown, Users, ShieldCheck } from 'lucide-react';
import { download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { Card, Loading, Table, Badge } from '../components/ui/index.jsx';
import { inr, fmtDate } from '../lib/format.js';

const GST_TONE = { compliant: 'green', attention: 'red', pending: 'amber', none: 'slate' };
const GST_LABEL = { compliant: 'Compliant', attention: 'Needs attention', pending: 'Pending IRN', none: 'No GST activity' };

function GstPanel({ gst }) {
  if (!gst) return null;
  const metrics = [
    ['e-Invoices', gst.einvoices], ['IRNs generated', gst.irns],
    ['e-Way Bills', gst.ewbs], ['Active EWBs', gst.activeEwbs],
    ['Total GST value', inr(gst.gstValue)], ['Last GST txn', gst.lastTxn ? fmtDate(gst.lastTxn) : '—'],
  ];
  return (
    <Card className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <ShieldCheck size={18} className="text-brand-600" /> GST Compliance
        </h3>
        <div className="flex items-center gap-3">
          <Badge tone={GST_TONE[gst.status] || 'slate'}>{GST_LABEL[gst.status] || gst.status}</Badge>
          <Link to="/gst/compliance" className="text-sm font-medium text-brand-600 hover:underline">Open workspace →</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map(([label, val]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <p className="text-[11px] font-semibold uppercase text-slate-400">{label}</p>
            <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{val}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function ClientLedger() {
  const { id } = useParams();
  const { data, loading } = useFetch(`/clients/${id}/ledger`);
  if (loading) return <Loading />;
  if (!data) return null;
  const { client, summary, entries, invoices, gst } = data;

  return (
    <div>
      <Link to="/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600">
        <ArrowLeft size={16} /> Back to clients
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white"><Users size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{client.name}</h1>
            <p className="text-sm text-slate-500">{client.gstin || 'Client'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => download(`/reports/client-ledger/${id}?format=xlsx`)}><FileDown size={16} /> Excel</button>
          <button className="btn-ghost" onClick={() => download(`/reports/client-ledger/${id}?format=pdf`)}><FileDown size={16} /> PDF</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Total Billed</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{inr(summary.total_billed)}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Total Received</p><p className="mt-1 text-2xl font-bold text-emerald-600">{inr(summary.total_received)}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Outstanding</p><p className="mt-1 text-2xl font-bold text-amber-600">{inr(summary.outstanding)}</p></Card>
      </div>

      <GstPanel gst={gst} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="!p-0">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><h3 className="font-semibold text-slate-800 dark:text-slate-100">Ledger Entries</h3></div>
          <Table
            columns={[{ header: 'Date' }, { header: 'Type' }, { header: 'Against invoice' }, { header: 'Amount', align: 'right' }, { header: 'Balance', align: 'right' }]}
            rows={entries}
            empty="No ledger activity."
            renderRow={(e) => {
              const received = e.direction === 'credit';
              return (
                <>
                  <td className="td whitespace-nowrap">
                    {fmtDate(e.entry_date)}
                    <div className="text-[11px] text-slate-400">{received ? 'Payment received' : 'Invoice raised'}</div>
                  </td>
                  <td className="td"><Badge tone={received ? 'green' : 'blue'}>{received ? 'Received' : 'Billed'}</Badge></td>
                  <td className="td">
                    {e.linked_invoice_no
                      ? <>{e.linked_invoice_no}{received && e.linked_invoice_date && <div className="text-[11px] text-slate-400">raised {fmtDate(e.linked_invoice_date)}</div>}</>
                      : <span className="text-slate-400" title={e.description}>{e.description || '—'}</span>}
                  </td>
                  <td className="td text-right">{inr(e.amount)}</td>
                  <td className="td text-right font-semibold">{inr(e.running_balance)}</td>
                </>
              );
            }}
          />
        </Card>

        <Card className="!p-0">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><h3 className="font-semibold text-slate-800 dark:text-slate-100">Invoices</h3></div>
          <Table
            columns={[{ header: 'Invoice #' }, { header: 'Status' }, { header: 'Total', align: 'right' }, { header: 'Received', align: 'right' }]}
            rows={invoices}
            empty="No invoices."
            renderRow={(i) => (
              <>
                <td className="td font-medium">{i.invoice_number}</td>
                <td className="td"><Badge status={i.status} /></td>
                <td className="td text-right">{inr(i.total_amount)}</td>
                <td className="td text-right text-emerald-600">{inr(i.amount_received)}</td>
              </>
            )}
          />
        </Card>
      </div>
    </div>
  );
}
