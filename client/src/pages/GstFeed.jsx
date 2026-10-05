import { useState } from 'react';
import { Rss, FileDown } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { Card, PageHeader, Loading, Badge } from '../components/ui/index.jsx';
import { dmyt, gstDownload } from '../lib/gst.js';

const CATS = ['Document', 'Compliance', 'Collaboration', 'Security', 'System', 'Reporting'];
const TONE = { Document: 'blue', Compliance: 'green', Collaboration: 'purple', Security: 'amber', System: 'slate', Reporting: 'blue' };

export default function GstFeed() {
  const [cat, setCat] = useState('');
  const { data, loading } = useFetch(`/gst/feed${cat ? `?category=${cat}` : ''}`, [cat]);

  return (
    <div>
      <PageHeader title="Business Activity Feed" subtitle="A human-readable stream of what's happening across the business — separate from the technical audit log."
        actions={<button className="btn-ghost" onClick={() => gstDownload(`/gst/feed?format=csv${cat ? `&category=${cat}` : ''}`, 'activity-feed.csv')}><FileDown size={16} /> Export</button>} />
      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCat('')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${!cat ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>All</button>
          {CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${cat === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>{c}</button>)}
        </div>
      </Card>
      <Card className="!p-0">
        {loading ? <Loading /> : !data?.length ? (
          <p className="py-12 text-center text-sm text-slate-400"><Rss size={20} className="mx-auto mb-2 text-slate-300" />No activity yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-lg">{e.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700 dark:text-slate-200">{e.title}</p>
                  <p className="text-xs text-slate-400">{dmyt(e.when)} {e.who ? `· ${e.who}` : ''}</p>
                </div>
                <Badge tone={TONE[e.category] || 'slate'}>{e.category}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
