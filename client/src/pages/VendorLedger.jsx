import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileDown, Building2, Plus, Loader2, CreditCard, ShieldCheck } from 'lucide-react';
import { api, apiError, download } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, Loading, Table, Badge, Field } from '../components/ui/index.jsx';
import { inr, fmtDate } from '../lib/format.js';

export default function VendorLedger() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading } = useFetch(`/vendors/${id}/ledger`);
  const { data: vendorDetail, refetch: refetchVendor } = useFetch(`/vendors/${id}`);
  const [acct, setAcct] = useState('');
  const [adding, setAdding] = useState(false);

  const addAccount = async () => {
    if (!acct.trim()) return;
    setAdding(true);
    try {
      await api.post(`/vendors/${id}/accounts`, { account_number: acct.trim(), label: 'manual' });
      toast.success('Beneficiary account linked — future statements will auto-map');
      setAcct(''); refetchVendor();
    } catch (e) { toast.error(apiError(e)); } finally { setAdding(false); }
  };

  if (loading) return <Loading />;
  if (!data) return null;
  const { vendor, summary, entries, gst } = data;
  const accounts = vendorDetail?.accounts || [];
  const valTone = { valid: 'green', warning: 'amber', invalid: 'red' };

  return (
    <div>
      <Link to="/vendors" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600">
        <ArrowLeft size={16} /> Back to vendors
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white"><Building2 size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{vendor.name}</h1>
            <p className="text-sm text-slate-500">{vendor.category || 'Vendor'}{vendor.gstin ? ` · ${vendor.gstin}` : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {vendor.is_candidate && <Badge tone="amber">Needs enrichment</Badge>}
          <button className="btn-ghost" onClick={() => download(`/reports/vendor-ledger/${id}?format=xlsx`)}><FileDown size={16} /> Excel</button>
          <button className="btn-ghost" onClick={() => download(`/reports/vendor-ledger/${id}?format=pdf`)}><FileDown size={16} /> PDF</button>
        </div>
      </div>

      <Card className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <CreditCard size={16} className="text-brand-500" /> Linked Beneficiary Accounts
          <span className="font-normal text-slate-400">— statements matching these auto-map to this vendor</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {accounts.length ? accounts.map((a) => (
            <span key={a.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-800">
              {a.account_number}{a.label ? <span className="ml-1 text-xs text-slate-400">({a.label})</span> : null}
            </span>
          )) : <span className="text-sm text-slate-400">No accounts linked yet.</span>}
        </div>
        <div className="mt-3 flex gap-2">
          <input className="input max-w-xs font-mono" placeholder="Add beneficiary account number" value={acct} onChange={(e) => setAcct(e.target.value)} />
          <button className="btn-ghost" onClick={addAccount} disabled={adding}>{adding ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Link</button>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Total Paid</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{inr(summary.total_paid)}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Opening Balance</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{inr(vendor.opening_balance)}</p></Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-400">Balance Payable</p>
          {Number(summary.balance) > 0
            ? <p className="mt-1 text-2xl font-bold text-amber-600">{inr(summary.balance)}</p>
            : <><p className="mt-1 text-2xl font-bold text-slate-500">{inr(0)}</p>
                {Number(summary.balance) < 0 && <p className="text-xs font-medium text-emerald-600">Advance paid — adjust vs future bills: {inr(-summary.balance)}</p>}</>}
        </Card>
      </div>

      {gst && (
        <Card className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <ShieldCheck size={18} className="text-brand-600" /> GST Status
          </h3>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <div><span className="text-slate-400">GSTIN: </span><span className="font-mono font-semibold">{gst.gstin}</span></div>
            {gst.validation ? (
              <>
                <div className="flex items-center gap-2"><span className="text-slate-400">Validation:</span>
                  <Badge tone={valTone[gst.validation.result] || 'slate'}>{gst.validation.result}</Badge></div>
                {gst.validation.portalStatus && <div><span className="text-slate-400">Portal status: </span><span className="font-medium">{gst.validation.portalStatus}</span></div>}
                {gst.validation.stateName && <div><span className="text-slate-400">State: </span><span className="font-medium">{gst.validation.stateName}</span></div>}
                <div><span className="text-slate-400">Checked: </span><span className="font-medium">{fmtDate(gst.validation.checkedAt)}</span></div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-slate-500">
                <Badge tone="slate">Not yet validated</Badge>
                <Link to="/gst/compliance" className="font-medium text-brand-600 hover:underline">Validate in GST workspace →</Link>
              </div>
            )}
            <div><span className="text-slate-400">Related GST docs: </span><span className="font-semibold">{gst.relatedDocs}</span></div>
          </div>
          <p className="mt-2 text-xs text-slate-400">Filing history (GSTR) will populate automatically once a live GSP is connected.</p>
        </Card>
      )}

      <Card className="!p-0">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Ledger Entries</h3>
        </div>
        <Table
          columns={[
            { header: 'Date' }, { header: 'Description' }, { header: 'Project' }, { header: 'Type' },
            { header: 'Debit', align: 'right' }, { header: 'Credit', align: 'right' }, { header: 'Balance', align: 'right' },
          ]}
          rows={entries}
          empty="No ledger activity yet."
          renderRow={(e) => (
            <>
              <td className="td whitespace-nowrap">{fmtDate(e.entry_date)}</td>
              <td className="td">{e.description || '—'}</td>
              <td className="td">{e.project_name || '—'}</td>
              <td className="td"><Badge tone={e.direction === 'debit' ? 'red' : 'green'}>{e.direction === 'debit' ? 'Paid' : 'Billed'}</Badge></td>
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
