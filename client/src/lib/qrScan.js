// ============================================================================
//  Read an e-invoice straight from the government's signed PDF (or a QR image /
//  screenshot) — no manual scanning or typing.
//
//  The signed QR (a JWS) encodes the IRN, doc details and the IRN date — but
//  NOT the Acknowledgement number. The Ack No (and Ack date) are printed as
//  TEXT on the portal's signed PDF, so for PDFs we also read the text layer and
//  parse them out. Final result merges both sources.
// ============================================================================
import jsQR from 'jsqr';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function imageDataFromCanvas(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

async function imageDataFromImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return [imageDataFromCanvas(canvas)];
  } finally { URL.revokeObjectURL(url); }
}

// Render the PDF (≤2 pages) to canvases for QR decoding AND pull the text layer.
async function renderPdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const images = [];
  let text = '';
  for (let p = 1; p <= Math.min(pdf.numPages, 2); p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 3 });   // high res so a small QR is readable
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport }).promise;
    images.push(imageDataFromCanvas(canvas));
    try {
      const tc = await page.getTextContent();
      text += ' ' + tc.items.map((it) => it.str).join(' ');
    } catch { /* image-only PDF — no text layer */ }
  }
  return { images, text };
}

function decodeQr(images) {
  for (const d of images) {
    const r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
    if (r && r.data) return r.data;
  }
  return null;
}

// Scan a file (PDF or image) → the QR's raw string (the SignedQRCode), or null.
export async function scanQrFromFile(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const images = isPdf ? (await renderPdf(file)).images : await imageDataFromImageFile(file);
  return decodeQr(images);
}

const b64url = (s) => { let t = s.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return atob(t); };

// Normalise a date string to yyyy-mm-dd (what the <input type=date> expects).
const MON = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
function normDate(s) {
  if (!s) return '';
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/-]([A-Za-z]{3})[A-Za-z]*[/-](\d{4})/); if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  return '';
}

// The signed QR is a JWS (hdr.payload.sig). The payload's `data` claim is the
// JSON of the QR fields (Irn, IrnDt, …). Pull IRN + date out for auto-fill.
export function parseSignedQr(qr) {
  try {
    const parts = String(qr).split('.');
    if (parts.length < 2) return {};
    const payload = JSON.parse(b64url(parts[1]));
    const data = typeof payload.data === 'string' ? JSON.parse(payload.data) : (payload.data || payload);
    const d = data.IrnDt || data.AckDt || '';
    return { irn: data.Irn || '', ackNo: data.AckNo ? String(data.AckNo) : '', ackDate: d ? String(d).slice(0, 10) : '' };
  } catch { return {}; }
}

// Parse the Ack No / Ack Date / IRN from the signed PDF's printed text.
export function parseAckFromText(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const out = {};
  // Ack No: a 6+ digit number after an "Ack No"-style label.
  let m = t.match(/Ack(?:nowledgement)?\.?\s*(?:No|Number|n)?\.?\s*[:#-]?\s*([0-9]{6,})/i);
  if (m) out.ackNo = m[1];
  // Ack Date: dd/mm/yyyy, dd-mm-yyyy or dd-Mon-yyyy after an "Ack Date" label.
  m = t.match(/Ack(?:nowledgement)?\.?\s*Date\.?\s*[:#-]?\s*([0-9]{1,2}[/-](?:[0-9]{1,2}|[A-Za-z]{3,})[/-][0-9]{2,4}(?:\s+[0-9:]{4,8})?)/i);
  if (m) out.ackDate = normDate(m[1]);
  // IRN fallback (64 hex) if the QR couldn't be read.
  m = t.match(/IRN\.?\s*[:#-]?\s*([0-9a-fA-F]{64})/);
  if (m) out.irn = m[1].toLowerCase();
  return out;
}

// One call: PDF (or image) → { qr, irn, ackNo, ackDate, signedQr }, merging the
// QR (IRN + date) with the PDF text (Ack No + Ack date).
export async function scanEInvoiceFromFile(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let images, text = '';
  if (isPdf) { const r = await renderPdf(file); images = r.images; text = r.text; }
  else images = await imageDataFromImageFile(file);

  const qr = decodeQr(images);
  const fromQr = qr ? parseSignedQr(qr) : {};
  const fromText = text ? parseAckFromText(text) : {};
  return {
    qr,
    irn: fromQr.irn || fromText.irn || '',
    ackNo: fromQr.ackNo || fromText.ackNo || '',
    ackDate: fromQr.ackDate || fromText.ackDate || '',
    signedQr: qr || '',
  };
}
