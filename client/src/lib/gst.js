// Shared GST UI helpers: status tones/labels, formatting, blank templates.
import { api, blockExportForAdmin } from '../api/client.js';
import { chooseDownloadLanguage, isTranslatableDownload, withLang } from './langPrompt.js';

export const EINV_STATUS = {
  draft: ['slate', 'Draft'],
  validated: ['blue', 'Validated'],
  pending_submission: ['amber', 'Pending Submission'],
  submitted: ['amber', 'Submitted'],
  irn_generated: ['green', 'IRN Generated'],
  printed: ['green', 'Printed'],
  cancelled: ['red', 'Cancelled'],
  archived: ['slate', 'Archived'],
  error: ['red', 'Error'],
  needs_review: ['amber', 'Needs Review'],
};

export const EWB_STATUS = {
  draft: ['slate', 'Draft'],
  validated: ['blue', 'Validated'],
  part_a: ['amber', 'Part-B Pending'],
  generated: ['green', 'Generated'],
  printed: ['green', 'Printed'],
  cancelled: ['red', 'Cancelled'],
  rejected: ['red', 'Rejected'],
  expired: ['red', 'Expired'],
  closed: ['purple', 'Closed'],
  error: ['red', 'Error'],
  needs_review: ['amber', 'Needs Review'],
};

export const einvStatus = (s) => EINV_STATUS[s] || ['slate', s];
export const ewbStatus = (s) => EWB_STATUS[s] || ['slate', s];

export const inr = (v) =>
  '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dmy = (d) => {
  if (!d) return '—';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return String(d);
  return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
};
export const dmyt = (d) => {
  if (!d) return '—';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return String(d);
  return `${dmy(d)} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
};

// Download a file from an authenticated GST endpoint (PDF / JSON / export).
export async function gstDownload(path, fallbackName = 'document') {
  if (blockExportForAdmin()) return;
  if (isTranslatableDownload(path)) {
    const lang = await chooseDownloadLanguage(); // English / हिन्दी popup (PDFs only; JSON skips)
    if (lang === null) return;                    // user cancelled
    path = withLang(path, lang);
  }
  const { data, headers } = await api.get(path, { responseType: 'blob' });
  const disp = headers['content-disposition'] || '';
  const m = disp.match(/filename="?([^"]+)"?/);
  const name = m ? m[1] : fallbackName;
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export const blankItem = () => ({
  description: '', hsn: '', quantity: 1, unit: 'NOS', unitPrice: 0,
  taxableValue: 0, gstRate: 18, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, cessRate: 0, cessAmount: 0, totalItemValue: 0,
});

// Recompute item amounts + invoice valuation. intra = same state → CGST+SGST, else IGST.
export function recalcInvoice(form) {
  const intra = String(form.seller?.stateCode || '') === String(form.buyer?.pos || form.buyer?.stateCode || '');
  let assess = 0, cgst = 0, sgst = 0, igst = 0, cess = 0;
  const items = (form.items || []).map((it, i) => {
    const qty = Number(it.quantity || 0);
    const rate = Number(it.unitPrice || 0);
    const taxable = it.taxableValue ? Number(it.taxableValue) : qty * rate;
    const gst = Number(it.gstRate || 0);
    const cessRate = Number(it.cessRate || 0);
    const tax = (taxable * gst) / 100;
    const cessAmt = (taxable * cessRate) / 100;
    const o = {
      ...it, slNo: i + 1, quantity: qty, unitPrice: rate, taxableValue: taxable, grossAmount: qty * rate,
      igstAmount: intra ? 0 : tax, cgstAmount: intra ? tax / 2 : 0, sgstAmount: intra ? tax / 2 : 0,
      cessAmount: cessAmt, totalItemValue: taxable + tax + cessAmt,
    };
    assess += taxable; cess += cessAmt;
    if (intra) { cgst += tax / 2; sgst += tax / 2; } else { igst += tax; }
    return o;
  });
  const total = assess + cgst + sgst + igst + cess;
  return {
    ...form, items,
    val: { assessableValue: r2(assess), cgstValue: r2(cgst), sgstValue: r2(sgst), igstValue: r2(igst), cessValue: r2(cess), roundOff: 0, totalInvoiceValue: r2(total) },
    igstOnIntra: false,
  };
}
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
