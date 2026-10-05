import { useState } from 'react';
import { FileSpreadsheet, FileText, FileJson, Loader2 } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { Card, PageHeader, Loading } from '../components/ui/index.jsx';
import { gstDownload } from '../lib/gst.js';

const REPORTS = [
  ['gst-summary', 'GST Summary'],
  ['hsn-summary', 'HSN Summary'],
  ['customer-tax', 'Customer-wise Tax'],
  ['state-tax', 'State-wise Tax'],
  ['irn-status', 'IRN Success / Failure'],
  ['ewb-validity', 'EWB Validity'],
  ['cancelled', 'Cancelled Documents'],
  ['audit', 'Audit Activity'],
];

const isMoney = (h) => /taxable|tax|total|cgst|sgst|igst|cess|value/i.test(h);
const fmt = (v, h) => (isMoney(h) && typeof v === 'number' ? '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : (v == null ? '—' : String(v)));

export default function GstReports() {
  const [type, setType] = useState('gst-summary');
  const path = type === 'audit' ? '/gst/audit' : `/gst/reports/${type}`;
  const { data, loading } = useFetch(path, [type]);
  const rows = data?.rows || [];
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const title = REPORTS.find(([t]) => t === type)?.[1] || 'Report';
  const exp = (format) => gstDownload(`${path}?format=${format}`, `${type}.${format}`);

  return (
    <div>
      <PageHeader
        title="GST Compliance Reports"
        subtitle="Management-ready compliance reports. Export to Excel, CSV or JSON."
        actions={<>
          <button className="btn-ghost" onClick={() => exp('xlsx')}><FileSpreadsheet size={16} /> Excel</button>
          <button className="btn-ghost" onClick={() => exp('csv')}><FileText size={16} /> CSV</button>
          {type !== 'audit' && <button className="btn-ghost" onClick={() => exp('json')}><FileJson size={16} /> JSON</button>}
        </>}
      />
      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap gap-2">
          {REPORTS.map(([t, label]) => (
            <button key={t} onClick={() => setType(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${type === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : !rows.length ? (
          <p className="py-16 text-center text-sm text-slate-400">No data for “{title}” yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>{headers.map((h) => <th key={h} className={`th ${isMoney(h) ? 'text-right' : ''}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {headers.map((h) => <td key={h} className={`td ${isMoney(h) ? 'text-right font-medium' : ''}`}>{fmt(r[h], h)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
