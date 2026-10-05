// Coordinate-level layout verification using pdfjs-dist (no rasterizer needed).
// Extracts every text run with its x/y, prints the page-1 structure top→bottom,
// and asserts layout invariants.  Run: node scripts/pdf-verify.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '..', 'uploads', '_pdftest');

async function items(file, pageNo = 1) {
  const data = new Uint8Array(fs.readFileSync(path.join(DIR, file)));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await pdf.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const H = vp.height;
  const runs = tc.items
    .filter((i) => i.str.trim())
    .map((i) => ({ str: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(H - i.transform[5]) })) // y from TOP
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return { runs, H, W: vp.width, pages: pdf.numPages };
}

function report(label, file) {
  return items(file).then(({ runs, H, W, pages }) => {
    console.log(`\n══ ${label}  (${file}, ${pages} page${pages > 1 ? 's' : ''}, ${W}×${H}) ══`);
    // group runs by row (y within 4px)
    const rows = [];
    for (const r of runs) {
      const row = rows.find((x) => Math.abs(x.y - r.y) <= 4);
      if (row) row.cells.push(r); else rows.push({ y: r.y, cells: [r] });
    }
    for (const row of rows.slice(0, 40)) {
      const txt = row.cells.map((c) => c.str).join('  ·  ');
      console.log(`  y=${String(row.y).padStart(3)}  ${txt.slice(0, 110)}`);
    }
    // ── invariants ──
    const footerTop = H - 46;
    const flat = runs.map((r) => r.str.toLowerCase());
    const has = (s) => flat.some((t) => t.includes(s.toLowerCase()));
    const checks = [];
    checks.push(['header at top (y<70)', runs.some((r) => r.y < 70)]);
    checks.push(['page number present', has('page 1 of')]);
    const belowFooter = runs.filter((r) => r.y > footerTop + 30 && !/page \d+ of|computer-generated|signature required|digitally|jurisdiction|E\.? ?& ?O\.? ?E|carry this|cancelled|closed|due within|registered/i.test(r.str));
    checks.push(['no stray content below footer', belowFooter.length === 0, belowFooter.map((r) => r.str).join(' / ')]);
    return { label, checks, runs };
  });
}

const targets = [
  ['e-Invoice (20 items)', 'einvoice_20.pdf', ['tax invoice', 'irn', 'supplier', 'recipient', 'hsn', 'total invoice value', 'authorised signatory']],
  ['e-Way Bill (20 items)', 'ewb_20.pdf', ['e-way bill', 'part a', 'part b', 'from', 'to', 'transporter', 'authorised signatory']],
];

let fail = 0;
for (const [label, file, mustHave] of targets) {
  const { checks, runs } = await report(label, file);
  const flat = runs.map((r) => r.str.toLowerCase());
  console.log('  ── checks ──');
  for (const [name, ok, extra] of checks) { console.log(`     ${ok ? '✓' : '✗'} ${name}${extra ? '  (' + extra + ')' : ''}`); if (!ok) fail++; }
  for (const m of mustHave) { const ok = flat.some((t) => t.includes(m)); console.log(`     ${ok ? '✓' : '✗'} contains "${m}"`); if (!ok) fail++; }
}
console.log(fail ? `\n  ${fail} invariant failure(s).\n` : '\n  ✓ All layout invariants pass.\n');
