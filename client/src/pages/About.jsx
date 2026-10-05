import { Sun, ShieldCheck, Landmark, Building2 } from 'lucide-react';
import { PageHeader, Card } from '../components/ui/index.jsx';
import { company } from '../config/company.js';

export default function About() {
  return (
    <div>
      <PageHeader title="About the Company" subtitle="Organization profile, certifications and banking details." />

      <Card className="mb-4 overflow-hidden !p-0">
        <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-8 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><Sun size={26} /></div>
            <div>
              <h2 className="text-2xl font-extrabold">{company.name}</h2>
              <p className="text-brand-100">{company.tagline}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {company.certifications.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                <ShieldCheck size={12} /> {c}
              </span>
            ))}
          </div>
        </div>
        <div className="p-6">
          <p className="leading-relaxed text-slate-600 dark:text-slate-300">{company.about}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <Landmark size={18} className="text-brand-600" /> Primary Banking
          </h3>
          <dl className="space-y-2 text-sm">
            {[
              ['Bank', company.bank.name],
              ['Account Holder', company.bank.accountHolder],
              ['Account Number', company.bank.accountNumber],
              ['Branch', company.bank.branch],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
                <dt className="text-slate-400">{k}</dt>
                <dd className="text-right font-medium text-slate-700 dark:text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <Building2 size={18} className="text-brand-600" /> Strategic Clients & Partners
          </h3>
          <div className="flex flex-wrap gap-2">
            {company.clients.map((c) => (
              <span key={c} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {c}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        {company.name} — Financial Intelligence Platform · Designed &amp; developed by Siddhant Kumar
      </p>
    </div>
  );
}
