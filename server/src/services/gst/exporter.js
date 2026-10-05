// Serialises an array of flat row objects to CSV / XLSX / JSON for exports.
import ExcelJS from 'exceljs';
import { company } from '../../config/company.js';

export function toCsv(rows = []) {
  if (!rows.length) return 'No data';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\r\n');
}

export async function toXlsx(rows = [], title = 'Report') {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Siddhant Kumar';
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.mergeCells('A1', 'F1');
  ws.getCell('A1').value = `${company.pdfName} — ${title}`;
  ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1D4ED8' } };
  ws.addRow([]);
  if (rows.length) {
    const headers = Object.keys(rows[0]);
    const hr = ws.addRow(headers);
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }; });
    rows.forEach((r) => ws.addRow(headers.map((h) => r[h])));
    headers.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      let max = h.length;
      rows.forEach((r) => { const l = String(r[h] ?? '').length; if (l > max) max = l; });
      col.width = Math.min(Math.max(max + 2, 10), 45);
    });
  } else {
    ws.addRow(['No data']);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function exportContentType(format) {
  return {
    csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    json: 'application/json',
  }[format] || 'application/octet-stream';
}
