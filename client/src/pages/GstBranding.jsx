import { useState, useEffect, useRef } from 'react';
import { Palette, Upload, FileText, Truck, Loader2, Image, Calculator, ClipboardList } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card, PageHeader, Field } from '../components/ui/index.jsx';

export default function GstBranding() {
  const toast = useToast();
  const { data: branches } = useFetch('/gst/branches');
  const [branchId, setBranchId] = useState('');     // '' = company-level
  const { data: current, refetch } = useFetch(`/gst/branding${branchId ? `?branch_id=${branchId}` : ''}`, [branchId]);
  const [f, setF] = useState({});
  const [saving, setSaving] = useState(false);
  const logoRef = useRef(null); const sigRef = useRef(null); const stampRef = useRef(null);

  useEffect(() => {
    if (!current) return;
    const keys = ['headerText', 'footerText', 'terms', 'disclaimer', 'watermark', 'contactInfo', 'emailSignature',
      'pdfColor', 'headerBgColor', 'headerTextColor', 'tableHeadBgColor', 'tableHeadTextColor', 'textColor', 'mutedColor', 'lineColor', 'watermarkColor',
      'quoteScope', 'quoteTerms', 'quoteExclusions'];
    setF({ ...Object.fromEntries(keys.map((k) => [k, current[k] || ''])), _assets: { logoFile: current.logoFile, signatureFile: current.signatureFile, stampFile: current.stampFile } });
  }, [current]);

  // Full PDF theme — every colour is customizable; blank = sensible default.
  const THEME = [
    ['pdfColor', 'Accent', 'Section titles, totals, charts', '#1d4ed8'],
    ['headerBgColor', 'Header background', 'Top band on every PDF', '(accent)'],
    ['headerTextColor', 'Header text', 'Company name & document title', '#ffffff'],
    ['tableHeadBgColor', 'Table header background', 'Item-table header rows', '(accent)'],
    ['tableHeadTextColor', 'Table header text', '', '#ffffff'],
    ['textColor', 'Body text', 'Main document text', '#0f172a'],
    ['mutedColor', 'Secondary text', 'Labels, hints, footer', '#64748b'],
    ['lineColor', 'Lines & borders', 'Rules, table borders, boxes', '#e2e8f0'],
    ['watermarkColor', 'Watermark', 'The faint diagonal text', '(accent)'],
  ];
  const resetTheme = () => setF((x) => ({ ...x, ...Object.fromEntries(THEME.map(([k]) => [k, ''])) }));

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    try { await api.post('/gst/branding', { ...f, branchId: branchId || undefined }); toast.success('Branding saved'); refetch(); }
    catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };
  // Recommended specs per asset (PDF preserves aspect ratio, so off-ratio images letterbox rather than stretch).
  const SPECS = {
    logo: { rec: '1200 × 1200 px', fmt: 'PNG, transparent background', aspect: 1, tol: 0.35, minPx: 200 },
    signature: { rec: '1200 × 400 px', fmt: 'PNG, transparent background', aspect: 3, tol: 0.8, minPx: 150 },
    stamp: { rec: '1200 × 1200 px', fmt: 'PNG, transparent background', aspect: 1, tol: 0.35, minPx: 200 },
  };
  const MAX_BYTES = 3 * 1024 * 1024;
  const inspectImage = (slot, file) => new Promise((resolve) => {
    const warns = [];
    if (!/png|jpe?g/i.test(file.type)) warns.push('Use a PNG or JPG file (PNG with a transparent background is recommended).');
    if (file.size > MAX_BYTES) warns.push(`File is ${(file.size / 1048576).toFixed(1)} MB — keep it under 3 MB so PDFs stay fast and light.`);
    const spec = SPECS[slot];
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight; URL.revokeObjectURL(url);
      if (Math.min(w, h) < spec.minPx) warns.push(`Low resolution (${w} × ${h} px) — it may look blurry in print. Recommended ${spec.rec}.`);
      if (Math.abs(w / h - spec.aspect) > spec.tol) warns.push(`Shape is ${(w / h).toFixed(2)}:1; the recommended shape is about ${spec.aspect}:1 (${spec.rec}). It will be centred with blank space rather than stretched.`);
      resolve(warns);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(['This file could not be read as an image — please choose a valid PNG or JPG.']); };
    img.src = url;
  });
  const uploadAsset = async (slot, file) => {
    if (!file) return;
    const warns = await inspectImage(slot, file);
    if (warns.length && !window.confirm(`This ${slot} image may not look ideal:\n\n• ${warns.join('\n• ')}\n\nUpload it anyway?`)) return;
    try { const fd = new FormData(); fd.append('file', file); fd.append('slot', slot); if (branchId) fd.append('branchId', branchId); await api.post('/gst/branding/asset', fd); toast.success(`${slot} uploaded`); refetch(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const previewPdf = async (type) => {
    try {
      const { data } = await api.get(`/gst/branding/preview?type=${type}${branchId ? `&branch_id=${branchId}` : ''}`, { responseType: 'blob' });
      window.open(URL.createObjectURL(data), '_blank');
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title="Branding Manager" subtitle="Logos, signatures, stamps, headers, footers, terms and disclaimers — flow automatically into every PDF: e-Invoices, e-Way Bills and Quotations."
        actions={<>
          <button className="btn-ghost" onClick={() => previewPdf('einvoice')}><FileText size={16} /> Preview Invoice</button>
          <button className="btn-ghost" onClick={() => previewPdf('ewb')}><Truck size={16} /> Preview EWB</button>
          <button className="btn-ghost" onClick={() => previewPdf('quote')}><Calculator size={16} /> Preview Quotation</button>
          <button className="btn-ghost" onClick={() => previewPdf('challan')}><ClipboardList size={16} /> Preview Challan</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : <Palette size={16} />} Save</button>
        </>} />

      <Card className="mb-4 !p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500">Apply to:</span>
          <select className="input max-w-[260px]" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Company (all branches)</option>
            {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[['logo', logoRef, 'logoFile'], ['signature', sigRef, 'signatureFile'], ['stamp', stampRef, 'stampFile']].map(([slot, ref, key]) => (
          <Card key={slot} className="!p-4 text-center">
            <p className="mb-2 text-sm font-semibold capitalize text-slate-700 dark:text-slate-200">{slot}</p>
            <div className="mb-2 flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
              {f._assets?.[key] ? <img src={`/uploads/${f._assets[key]}`} alt={slot} className="max-h-20" /> : <Image size={28} className="text-slate-300" />}
            </div>
            <button className="btn-ghost !text-sm" onClick={() => ref.current?.click()}><Upload size={14} /> Upload {slot}</button>
            <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => uploadAsset(slot, e.target.files?.[0])} />
            <p className="mt-2 text-[11px] leading-tight text-slate-400">
              Recommended <span className="font-semibold text-slate-500 dark:text-slate-300">{SPECS[slot].rec}</span><br />
              {SPECS[slot].fmt} · max 3 MB · aspect ratio preserved
            </p>
          </Card>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Images are scaled to fit and centred in the PDF — the aspect ratio is always preserved, so pictures are never stretched or distorted.
        Off-ratio or low-resolution uploads trigger a warning before saving.
      </p>

      {/* PDF colour theme — every element independently customizable */}
      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><Palette size={18} className="text-brand-600" /> PDF colour theme</h3>
            <p className="text-xs text-slate-400">Set each colour independently — e.g. a blue header with golden text, white table headers with an accent rule. Leave blank for the default. Applies to invoices, e-Way Bills, quotations &amp; report exports.</p>
          </div>
          <button className="btn-ghost !text-sm" onClick={resetTheme}>Reset to defaults</button>
        </div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEME.map(([key, label, hint, dflt]) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</label>
              <div className="flex items-center gap-2">
                <input type="color" className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700"
                  value={/^#[0-9a-fA-F]{6}$/.test(f[key] || '') ? f[key] : (dflt.startsWith('#') ? dflt : '#1d4ed8')}
                  onChange={set(key)} />
                <input className="input flex-1 font-mono text-xs" value={f[key] || ''} onChange={set(key)} placeholder={dflt} />
                {f[key] && <button className="text-xs text-slate-400 hover:text-red-500" title="Clear (use default)" onClick={() => setF((x) => ({ ...x, [key]: '' }))}>✕</button>}
              </div>
              {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
            </div>
          ))}
        </div>
      </Card>

      {/* Header / footer / watermark + legal text */}
      <Card className="mt-4">
        <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Header, footer &amp; legal text</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="PDF Header Text"><input className="input" value={f.headerText || ''} onChange={set('headerText')} placeholder="Defaults to company name" /></Field>
          <Field label="Contact Info (header)"><input className="input" value={f.contactInfo || ''} onChange={set('contactInfo')} /></Field>
          <Field label="Watermark (faint, diagonal)"><input className="input" value={f.watermark || ''} onChange={set('watermark')} placeholder="e.g. ORIGINAL" /></Field>
          <Field label="PDF Footer Text"><input className="input" value={f.footerText || ''} onChange={set('footerText')} placeholder="Shown at the bottom of every page" /></Field>
          <Field label="Terms & Conditions"><textarea className="input min-h-[70px]" value={f.terms || ''} onChange={set('terms')} /></Field>
          <Field label="Legal Disclaimer"><textarea className="input min-h-[70px]" value={f.disclaimer || ''} onChange={set('disclaimer')} /></Field>
          <Field label="Email Signature"><textarea className="input min-h-[70px]" value={f.emailSignature || ''} onChange={set('emailSignature')} /></Field>
        </div>
      </Card>

      {/* Editable quotation default blocks */}
      <Card className="mt-4">
        <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><Calculator size={18} className="text-brand-600" /> Quotation default text</h3>
        <p className="mb-3 text-xs text-slate-400">Default Technical Scope, Commercial Terms &amp; Exclusions printed on quotations (a quote can still override these per document). Leave blank to use the built-in defaults.</p>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Technical Scope"><textarea className="input min-h-[60px]" value={f.quoteScope || ''} onChange={set('quoteScope')} placeholder="e.g. Supply, installation & commissioning of…" /></Field>
          <Field label="Commercial Terms"><textarea className="input min-h-[80px]" value={f.quoteTerms || ''} onChange={set('quoteTerms')} placeholder="Payment terms, delivery, warranty, validity…" /></Field>
          <Field label="Exclusions"><textarea className="input min-h-[60px]" value={f.quoteExclusions || ''} onChange={set('quoteExclusions')} placeholder="What is not included in the price…" /></Field>
        </div>
      </Card>
    </div>
  );
}
