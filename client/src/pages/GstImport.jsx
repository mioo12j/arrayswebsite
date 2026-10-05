import { useState } from 'react';
import { Upload, CheckCircle2, XCircle, Loader2, FileSpreadsheet } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Badge } from '../components/ui/index.jsx';
import { dmyt } from '../lib/gst.js';

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((ln) => {
    const cells = ln.split(',');
    const o = {}; headers.forEach((h, i) => { o[h] = (cells[i] || '').trim(); });
    return o;
  });
}

export default function GstImport() {
  const toast = useToast();
  const { data: entities } = useFetch('/gst/import/entities');
  const { data: history, refetch: refetchHistory } = useFetch('/gst/import/history');
  const [entity, setEntity] = useState('clients');
  const [format, setFormat] = useState('csv');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const rowsFromText = () => {
    try { return format === 'json' ? JSON.parse(text) : parseCsv(text); }
    catch { toast.error('Could not parse — check the format.'); return null; }
  };
  const doPreview = async () => {
    const rows = rowsFromText(); if (!rows) return;
    setBusy(true);
    try { const { data } = await api.post('/gst/import/preview', { entity, rows }); setPreview(data); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const doImport = async () => {
    const rows = rowsFromText(); if (!rows) return;
    setBusy(true);
    try { const { data } = await api.post('/gst/import/run', { entity, rows, skipInvalid: true }); toast.success(`Imported ${data.imported}, skipped ${data.skipped}`); setPreview(null); setText(''); refetchHistory(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const cols = (entities || []).find((e) => e.key === entity)?.columns || [];
  const validCount = preview ? preview.filter((r) => !r.errors.length).length : 0;

  return (
    <div>
      <PageHeader title="Data Import Wizard" subtitle="Bulk onboard master data and historical records. Validates each row before import." />
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <select className="input max-w-[180px]" value={entity} onChange={(e) => { setEntity(e.target.value); setPreview(null); }}>
            {(entities || []).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
          <select className="input max-w-[140px]" value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="csv">CSV (paste)</option>
            <option value="json">JSON array</option>
          </select>
        </div>
        <p className="mb-2 text-xs text-slate-400">Expected columns: <span className="font-mono">{cols.join(', ')}</span>. {format === 'csv' && 'First row = headers.'}</p>
        <textarea className="input min-h-[140px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={format === 'csv' ? `name,gstin,email\nTata Power,29AAGCB7383J1Z4,t@x.com` : '[{"name":"Tata Power","gstin":"29AAGCB7383J1Z4"}]'} />
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost" onClick={doPreview} disabled={busy || !text.trim()}>{busy ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />} Preview & Validate</button>
          {preview && validCount > 0 && <button className="btn-primary" onClick={doImport} disabled={busy}><Upload size={16} /> Import {validCount} valid row(s)</button>}
        </div>
      </Card>

      {preview && (
        <Card className="mb-4 !p-0">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold dark:border-slate-800">Preview — {validCount}/{preview.length} valid</div>
          <div className="max-h-80 overflow-auto">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.map((r) => (
                  <tr key={r.row}>
                    <td className="td">{r.errors.length ? <XCircle size={15} className="text-red-500" /> : <CheckCircle2 size={15} className="text-emerald-500" />}</td>
                    <td className="td font-mono text-xs">{JSON.stringify(r.data)}</td>
                    <td className="td text-xs text-red-500">{r.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="!p-0">
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold dark:border-slate-800">Import History</div>
        {!history?.length ? <p className="p-4 text-sm text-slate-400">No imports yet.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{h.entity} — <Badge tone="green">{h.imported} imported</Badge> {h.skipped > 0 && <Badge tone="amber">{h.skipped} skipped</Badge>}</span>
                <span className="text-xs text-slate-400">{h.by_name} • {dmyt(h.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
