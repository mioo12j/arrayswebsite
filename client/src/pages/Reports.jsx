import { FileSpreadsheet, FileText, ArrowUpRight, ArrowDownLeft, FolderKanban, Receipt } from 'lucide-react';
import { download } from '../api/client.js';
import { PageHeader, Card } from '../components/ui/index.jsx';

const REPORTS = [
  { key: 'payments', title: 'Outgoing Payments', desc: 'All vendor payments with classification & comments.', icon: ArrowUpRight, tone: 'text-red-600 bg-red-50' },
  { key: 'receipts', title: 'Incoming Receipts', desc: 'Client receipts with TDS, retention & deductions.', icon: ArrowDownLeft, tone: 'text-emerald-600 bg-emerald-50' },
  { key: 'invoices', title: 'Invoices', desc: 'All invoices with status & settlement balance.', icon: Receipt, tone: 'text-purple-600 bg-purple-50' },
  { key: 'projects', title: 'Project Profitability', desc: 'Budget vs spend vs received with gross margin.', icon: FolderKanban, tone: 'text-brand-600 bg-brand-50' },
];

export default function Reports() {
  return (
    <div>
      <PageHeader title="Reports & Exports" subtitle="Management-ready exports in Excel and PDF. Ledger exports are available on each vendor/client page." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <Card key={r.key}>
            <div className="flex items-start gap-4">
              <div className={`rounded-xl p-3 ${r.tone}`}><r.icon size={22} /></div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white">{r.title}</h3>
                <p className="mt-0.5 text-sm text-slate-500">{r.desc}</p>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => download(`/reports/${r.key}?format=xlsx`)} className="btn-ghost !py-1.5 !text-xs">
                    <FileSpreadsheet size={14} /> Excel
                  </button>
                  <button onClick={() => download(`/reports/${r.key}?format=pdf`)} className="btn-ghost !py-1.5 !text-xs">
                    <FileText size={14} /> PDF
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-sm text-slate-400">
        Tip: open a vendor or client to export their individual ledger statement.
      </p>
    </div>
  );
}
