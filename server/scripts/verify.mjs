// ============================================================================
//  End-to-end verification + realistic demo data seeding via the live API.
//  Run with the server already running on :4000.
//    node scripts/verify.mjs
//  Exercises real endpoints so the full automation chain is tested:
//  auth/RBAC -> structure -> invoices -> payments(OCR) -> receipts -> ledgers
//  -> reconciliation -> dashboard -> exports.
// ============================================================================
import PDFDocument from 'pdfkit';

const BASE = 'http://localhost:4000/api';
let pass = 0, fail = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name} ${detail ? '— ' + detail : ''}`); }
  return cond;
}

async function req(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body && !raw) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json')) data = await res.json();
  else data = res; // caller handles blobs/streams
  return { status: res.status, data, res };
}

// Build a Blob with an exact, non-pooled byte copy. Node's Buffer.concat /
// Buffer.from can return a view into a shared pool; Blob([buf]) may otherwise
// capture the whole pool and corrupt binary uploads. Uint8Array.from copies.
function blob(buf, type) {
  return new Blob([Uint8Array.from(buf)], { type });
}

function paymentPdfBuffer(text) {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(12).text(text);
    doc.end();
  });
}

async function main() {
  // ── 1. AUTH ───────────────────────────────────────────────────────────────
  const adminLogin = await req('POST', '/auth/login', { body: { email: 'admin@ingenieria.com', password: 'Admin@123' } });
  check('Admin login returns token', adminLogin.status === 200 && !!adminLogin.data.token);
  const admin = adminLogin.data.token;

  const opLogin = await req('POST', '/auth/login', { body: { email: 'operator@ingenieria.com', password: 'Operator@123' } });
  check('Operator login returns token', opLogin.status === 200 && !!opLogin.data.token);
  const op = opLogin.data.token;

  const badLogin = await req('POST', '/auth/login', { body: { email: 'admin@ingenieria.com', password: 'wrong' } });
  check('Wrong password rejected (401)', badLogin.status === 401);

  const me = await req('GET', '/auth/me', { token: admin });
  check('GET /auth/me works with token', me.status === 200 && me.data.user.role === 'admin');

  // ── 2. RBAC ─────────────────────────────────────────────────────────────────
  const opUsers = await req('GET', '/users', { token: op });
  check('Operator BLOCKED from /users (403)', opUsers.status === 403);
  const adminUsers = await req('GET', '/users', { token: admin });
  check('Admin allowed on /users', adminUsers.status === 200);
  const noToken = await req('GET', '/payments');
  check('Unauthenticated request blocked (401)', noToken.status === 401);

  // ── 3. STRUCTURE: clients, vendors, projects, sites ──────────────────────────
  const catRes = await req('GET', '/categories', { token: op });
  const cats = catRes.data;
  const catId = (n) => cats.find((c) => c.name === n)?.id;

  const client1 = (await req('POST', '/clients', { token: op, body: { name: 'Tata Power Solar', gstin: '27AAACT1234A1Z5', opening_balance: 0 } })).data;
  const client2 = (await req('POST', '/clients', { token: op, body: { name: 'Gujarat Energy Dev Agency', gstin: '24AAAGG5678B1Z3' } })).data;
  check('Created clients', !!client1.id && !!client2.id);

  const vSteel = (await req('POST', '/vendors', { token: op, body: { name: 'Steelworks India Pvt Ltd', category: 'Steel', opening_balance: 50000 } })).data;
  const vPanels = (await req('POST', '/vendors', { token: op, body: { name: 'SunPanel Distributors', category: 'Solar Panels' } })).data;
  const vTransport = (await req('POST', '/vendors', { token: op, body: { name: 'Bharat Logistics', category: 'Transport' } })).data;
  check('Created vendors', !!vSteel.id && !!vPanels.id && !!vTransport.id);

  const proj1 = (await req('POST', '/projects', { token: op, body: { name: 'Samsung Rooftop 2MW', code: 'PRJ-001', client_id: client1.id, capacity_kw: 2000, budget: 8000000, contract_value: 11000000, location: 'Sriperumbudur' } })).data;
  const proj2 = (await req('POST', '/projects', { token: op, body: { name: 'GEDA Ground Mount 5MW', code: 'PRJ-002', client_id: client2.id, capacity_kw: 5000, budget: 20000000, contract_value: 26000000, location: 'Charanka' } })).data;
  check('Created projects', !!proj1.id && !!proj2.id);

  const site1 = (await req('POST', `/projects/${proj1.id}/sites`, { token: op, body: { name: 'Phase 4 Block A', budget: 3000000, latitude: 12.9716, longitude: 79.1588 } })).data;
  check('Created site under project', !!site1.id && site1.project_id === proj1.id);

  // ── 4. INVOICES (client billing -> ledger debit) ─────────────────────────────
  const inv1 = (await req('POST', '/invoices', { token: op, body: { invoice_number: 'INV-2026-001', type: 'tax', status: 'sent', client_id: client1.id, project_id: proj1.id, issue_date: '2026-04-05', due_date: '2026-12-31', taxable_amount: 5000000, gst_amount: 900000 } })).data;
  check('Created invoice (total auto = taxable+gst)', inv1.total_amount === 5900000);

  const c1ledgerAfterInv = (await req('GET', `/clients/${client1.id}/ledger`, { token: op })).data;
  check('Invoice posts client ledger debit (billed = total)', c1ledgerAfterInv.summary.total_billed === 5900000, `got ${c1ledgerAfterInv.summary.total_billed}`);
  check('Client outstanding = invoice total', c1ledgerAfterInv.summary.outstanding === 5900000);

  // ── 5. OCR EXTRACTION (PDF) ──────────────────────────────────────────────────
  const pdfText = [
    'NEFT Payment Confirmation',
    'Status: SUCCESS',
    'Amount: Rs 1250000.00',
    'UTR No: HDFCN52026041201',
    'Date: 12/04/2026',
    'Beneficiary: Steelworks India Pvt Ltd',
    'A/c: XXXXXX4321',
    'Remarks: Advance for 2 ton steel',
  ].join('\n');
  const pdfBuf = await paymentPdfBuffer(pdfText);
  const fd = new FormData();
  fd.append('file', blob(pdfBuf, 'application/pdf'), 'payment-proof.pdf');
  const extract = await req('POST', '/payments/extract', { token: op, body: fd, raw: true });
  const ex = extract.data.extracted || {};
  check('OCR extract returns a document id', !!extract.data.document_id);
  check('OCR parsed amount = 1250000', ex.amount === 1250000, `got ${ex.amount}`);
  check('OCR parsed UTR reference', /HDFCN52026041201/.test(ex.reference_id || ''), `got ${ex.reference_id}`);
  check('OCR parsed date 2026-04-12', ex.payment_date === '2026-04-12', `got ${ex.payment_date}`);
  check('OCR parsed network NEFT', ex.network_type === 'NEFT', `got ${ex.network_type}`);

  // ── 6. PAYMENTS: mandatory comment + ledger ──────────────────────────────────
  const noComment = await req('POST', '/payments', { token: op, body: { amount: 1000, vendor_id: vSteel.id } });
  check('Payment WITHOUT comment rejected (400)', noComment.status === 400);

  const pay1 = (await req('POST', '/payments', { token: op, body: {
    amount: 1250000, payment_date: '2026-04-12', reference_id: 'HDFCN52026041201',
    beneficiary_name: 'Steelworks India Pvt Ltd', network_type: 'NEFT', payment_mode: 'neft',
    vendor_id: vSteel.id, project_id: proj1.id, site_id: site1.id, category_id: catId('Steel'),
    comment: 'Advance for 2 ton steel — Samsung Phase 4', proof_document_id: extract.data.document_id,
    material_type: '2 ton steel', tags: ['advance', 'steel'],
  } })).data;
  check('Payment saved with comment', !!pay1.id);
  check('Payment marked invoice pending', pay1.invoice_status === 'pending');

  const pay2 = (await req('POST', '/payments', { token: op, body: {
    amount: 800000, payment_date: '2026-04-18', reference_id: 'ICICR2026041801',
    vendor_id: vPanels.id, project_id: proj1.id, category_id: catId('Solar Panels'),
    comment: 'Panel procurement milestone 1', payment_mode: 'rtgs',
  } })).data;
  const pay3 = (await req('POST', '/payments', { token: op, body: {
    amount: 150000, payment_date: '2026-04-20', vendor_id: vTransport.id, project_id: proj2.id,
    category_id: catId('Transport'), comment: 'Transport for panel dispatch', payment_mode: 'imps',
  } })).data;
  check('Created multiple payments', !!pay2.id && !!pay3.id);

  const vSteelLedger = (await req('GET', `/vendors/${vSteel.id}/ledger`, { token: op })).data;
  check('Vendor ledger shows payment as debit', vSteelLedger.summary.total_paid === 1250000, `got ${vSteelLedger.summary.total_paid}`);
  // opening 50000 (credit) - 1250000 paid => balance -1200000
  check('Vendor balance = opening - paid', vSteelLedger.summary.balance === (50000 - 1250000), `got ${vSteelLedger.summary.balance}`);

  // Attach invoice later -> status flips
  const invForPay = await paymentPdfBuffer('Tax Invoice for steel supply');
  const fd2 = new FormData();
  fd2.append('file', blob(invForPay, 'application/pdf'), 'vendor-invoice.pdf');
  const attach = await req('POST', `/payments/${pay1.id}/invoice`, { token: op, body: fd2, raw: true });
  check('Attaching invoice flips status to attached', attach.status === 200 && attach.data.payment.invoice_status === 'attached');

  // ── 7. RECEIPTS: client ledger credit + invoice settlement ───────────────────
  const rec1 = (await req('POST', '/receipts', { token: op, body: {
    credited_amount: 4000000, credited_date: '2026-04-25', reference_id: 'TATA2026042501',
    client_id: client1.id, invoice_id: inv1.id, project_id: proj1.id,
    tds_amount: 100000, retention_amount: 200000, comment: 'Milestone 1 from Tata Power',
  } })).data;
  check('Receipt saved', !!rec1.id);

  const c1ledger = (await req('GET', `/clients/${client1.id}/ledger`, { token: op })).data;
  // settled = 4000000 + 0 deduction + 100000 tds + 200000 retention = 4300000
  check('Receipt credits client ledger by settled value', c1ledger.summary.total_received === 4300000, `got ${c1ledger.summary.total_received}`);
  check('Client outstanding reduced (5.9M - 4.3M)', c1ledger.summary.outstanding === (5900000 - 4300000), `got ${c1ledger.summary.outstanding}`);

  const inv1After = (await req('GET', `/invoices/${inv1.id}`, { token: op })).data;
  check('Linked invoice -> partially_paid', inv1After.status === 'partially_paid', `got ${inv1After.status}`);
  check('Invoice amount_received reflects receipt', inv1After.amount_received === 4300000, `got ${inv1After.amount_received}`);

  // ── 8. RECONCILIATION ────────────────────────────────────────────────────────
  // Build a CSV: 1 debit matching pay2 by reference, 1 credit matching rec1 by amount+date,
  // 1 unmatched debit (new vendor expense).
  const csv = [
    'Date,Narration,Reference,Debit,Credit,Balance',
    '18/04/2026,RTGS PANEL VENDOR,ICICR2026041801,800000,,4200000',
    '25/04/2026,NEFT CR TATA POWER,TATA2026042501,,4000000,8200000',
    '28/04/2026,NEFT LABOUR CONTRACTOR,UNKWN999,95000,,8105000',
  ].join('\n');
  const fd3 = new FormData();
  fd3.append('file', blob(Buffer.from(csv), 'text/csv'), 'april-statement.csv');
  fd3.append('label', 'ICICI — April 2026');
  fd3.append('bank_name', 'ICICI Bank');
  const stmt = await req('POST', '/reconciliation/statements', { token: op, body: fd3, raw: true });
  const st = stmt.data.statement;
  check('Statement parsed 3 lines', st && st.total_lines === 3, `got ${st?.total_lines}`);
  check('Auto-matched 2 lines', st && st.matched_count === 2, `got ${st?.matched_count}`);
  check('1 line unmatched', st && st.unmatched_count === 1, `got ${st?.unmatched_count}`);

  const stDetail = (await req('GET', `/reconciliation/statements/${st.id}`, { token: op })).data;
  const unmatchedLine = stDetail.lines.find((l) => l.status === 'unmatched');
  check('Found the unmatched line', !!unmatchedLine);

  const resolveNoComment = await req('POST', `/reconciliation/lines/${unmatchedLine.id}/resolve`, { token: op, body: { vendor_id: vTransport.id } });
  check('Resolve WITHOUT comment rejected (400)', resolveNoComment.status === 400);

  const resolved = await req('POST', `/reconciliation/lines/${unmatchedLine.id}/resolve`, { token: op, body: {
    comment: 'Labour contractor payment — found via reconciliation', vendor_id: vTransport.id, project_id: proj2.id, category_id: catId('Labour'),
  } });
  check('Resolve creates payment & matches line', resolved.status === 200 && resolved.data.createdType === 'payment');

  const summaryRecon = (await req('GET', '/reconciliation/summary', { token: admin })).data;
  check('Reconciliation summary has 0 pending review', Number(summaryRecon.pending_review) === 0, `got ${summaryRecon.pending_review}`);

  // ── 9. DASHBOARD ─────────────────────────────────────────────────────────────
  const dash = (await req('GET', '/dashboard/summary', { token: admin })).data;
  // payments: 1.25M + 0.8M + 0.15M + 0.095M (recon) = 2,295,000
  check('Dashboard total_outgoing = 2,295,000', dash.total_outgoing === 2295000, `got ${dash.total_outgoing}`);
  check('Dashboard total_incoming = 4,000,000', dash.total_incoming === 4000000, `got ${dash.total_incoming}`);
  check('Dashboard active_projects = 2', dash.active_projects === 2, `got ${dash.active_projects}`);

  const cashflow = (await req('GET', '/dashboard/cashflow?months=3', { token: admin })).data;
  check('Cashflow returns monthly series', Array.isArray(cashflow) && cashflow.length === 3);
  const byCat = (await req('GET', '/dashboard/expense-by-category', { token: admin })).data;
  check('Expense-by-category populated', Array.isArray(byCat) && byCat.some((c) => c.amount > 0));

  // ── 10. PROJECT PROFITABILITY ────────────────────────────────────────────────
  const proj1Detail = (await req('GET', `/projects/${proj1.id}`, { token: admin })).data;
  // proj1 spend: pay1 1.25M + pay2 0.8M = 2.05M ; received: 4.0M
  check('Project spent aggregates payments', proj1Detail.total_spent === 2050000, `got ${proj1Detail.total_spent}`);
  check('Project received aggregates receipts', proj1Detail.total_received === 4000000, `got ${proj1Detail.total_received}`);
  check('Project gross margin = contract - spent', proj1Detail.gross_margin === (11000000 - 2050000));

  // ── 11. EXPORTS ──────────────────────────────────────────────────────────────
  const xlsxRes = await fetch(BASE + '/reports/payments?format=xlsx', { headers: { Authorization: `Bearer ${admin}` } });
  const xlsxBuf = Buffer.from(await xlsxRes.arrayBuffer());
  check('Excel export content-type', (xlsxRes.headers.get('content-type') || '').includes('spreadsheetml'));
  check('Excel export non-trivial size', xlsxBuf.length > 2000, `${xlsxBuf.length} bytes`);
  // xlsx files are zip archives -> start with PK
  check('Excel export is a valid xlsx (PK header)', xlsxBuf[0] === 0x50 && xlsxBuf[1] === 0x4b);

  const pdfRes = await fetch(BASE + '/reports/projects?format=pdf', { headers: { Authorization: `Bearer ${admin}` } });
  const pdfRBuf = Buffer.from(await pdfRes.arrayBuffer());
  check('PDF export content-type', (pdfRes.headers.get('content-type') || '').includes('application/pdf'));
  check('PDF export is a valid pdf (%PDF header)', pdfRBuf.slice(0, 4).toString() === '%PDF');

  // ── 12. AUDIT LOG ─────────────────────────────────────────────────────────────
  const audit = (await req('GET', '/audit?limit=500', { token: admin })).data;
  check('Audit log recorded create actions', Array.isArray(audit) && audit.some((a) => a.action === 'create' && a.entity === 'payments'));
  check('Audit log recorded login', audit.some((a) => a.action === 'login'));
  check('Audit log recorded reconcile', audit.some((a) => a.action === 'reconcile'));

  // ── 13. BRANDING ──────────────────────────────────────────────────────────────
  const co = (await req('GET', '/company')).data;
  check('Company profile is ARRAYS INGENIERIA', co.name === 'ARRAYS INGENIERIA PRIVATE LIMITED');
  check('Company bank is IDBI with correct account', co.bank?.name === 'IDBI Bank' && co.bank?.accountNumber === '0875102000012290');

  // ── 14. VENDOR MASTER + AUTO-MAP ────────────────────────────────────────────────
  const vMoni = (await req('POST', '/vendors', { token: op, body: { name: 'MONI KUMAR', category: 'Labour', bank_account: '32911016237', tags: ['labour'] } })).data;
  const vRemedie = (await req('POST', '/vendors', { token: op, body: { name: 'REMEDIE ENTERPRISES', category: 'Civil', bank_account: '50200086148945' } })).data;
  check('Vendor Master entries created', !!vMoni.id && !!vRemedie.id);

  // ── 15. IDBI STATEMENT INTELLIGENCE ─────────────────────────────────────────────
  const idbiCsv = [
    'Transaction Date,Description,Dr./Cr.,Amount,Timestamp,Balance',
    '02/05/2026,IPAY/INST/NEFT/007722305751/32911016237/MONI KUMAR,Dr,55000,10:12:33,7400000',
    '03/05/2026,IPAY/INST/RTGS/007722287371/50200086148945/REMEDIE,Dr,220000,11:45:02,7180000',
    '04/05/2026,IPAY/INST/NEFT/007722999999/99999999999/MONI KUMAR SINGH,Dr,18000,09:05:00,7162000',
  ].join('\n');
  const fdIdbi = new FormData();
  fdIdbi.append('file', blob(Buffer.from(idbiCsv), 'text/csv'), 'idbi-may.csv');
  fdIdbi.append('label', 'IDBI — May 2026');
  fdIdbi.append('bank_name', 'IDBI Bank');
  const idbiStmt = await req('POST', '/reconciliation/statements', { token: op, body: fdIdbi, raw: true });
  check('IDBI statement parsed 3 lines', idbiStmt.data.statement?.total_lines === 3, `got ${idbiStmt.data.statement?.total_lines}`);

  const idbiLines = (await req('GET', `/reconciliation/statements/${idbiStmt.data.statement.id}`, { token: op })).data.lines;
  const moniLine = idbiLines.find((l) => l.account_number === '32911016237');
  check('Narration parsed mode NEFT', moniLine?.mode === 'NEFT', `got ${moniLine?.mode}`);
  check('Narration parsed reference', moniLine?.reference_id === '007722305751', `got ${moniLine?.reference_id}`);
  check('Narration parsed account number', moniLine?.account_number === '32911016237');
  check('Narration parsed beneficiary', moniLine?.beneficiary === 'MONI KUMAR', `got ${moniLine?.beneficiary}`);
  check('Auto-mapped vendor by ACCOUNT (100%)', moniLine?.vendor_id === vMoni.id && Number(moniLine?.vendor_confidence) === 100);

  const remedieLine = idbiLines.find((l) => l.account_number === '50200086148945');
  check('RTGS line parsed + account auto-mapped', remedieLine?.mode === 'RTGS' && remedieLine?.vendor_id === vRemedie.id);

  const fuzzyLine = idbiLines.find((l) => l.account_number === '99999999999');
  check('Fuzzy NAME auto-map (unknown account -> MONI KUMAR)', fuzzyLine?.vendor_id === vMoni.id && Number(fuzzyLine?.vendor_confidence) < 100, `vendor=${fuzzyLine?.vendor_id} conf=${fuzzyLine?.vendor_confidence}`);

  // Resolve a parsed line -> payment should inherit vendor + mode
  const resolveIdbi = await req('POST', `/reconciliation/lines/${moniLine.id}/resolve`, { token: op, body: { comment: 'Labour payment May wk1', project_id: proj2.id, category_id: catId('Labour') } });
  check('Resolved IDBI line into a payment', resolveIdbi.status === 200 && resolveIdbi.data.createdType === 'payment');

  // ── 16. QUOTE / SOLAR ESTIMATION ────────────────────────────────────────────────
  const calc = (await req('POST', '/quotes/calculate', { token: op, body: { capacity_kw: 100, project_type: 'rooftop' } })).data;
  check('Calculator panel count = ceil(100000/545) = 184', calc.panel_count === 184, `got ${calc.panel_count}`);
  check('Calculator produced 9 BOQ line items', Array.isArray(calc.line_items) && calc.line_items.length === 9);
  check('Calculator total > taxable > cost (margin+gst applied)', calc.total_amount > calc.taxable_amount && calc.taxable_amount > calc.cost_amount);
  check('Calculator per-watt computed', calc.per_watt > 0);

  const quote = (await req('POST', '/quotes', { token: op, body: { capacity_kw: 250, project_type: 'ground_mount', client_id: client1.id, location: 'Charanka', valid_until: '2026-12-31' } })).data;
  check('Quote created with QT number', /^QT-\d{4}-\d{4}$/.test(quote.quote_number), `got ${quote.quote_number}`);
  check('Quote persisted totals', quote.total_amount > 0 && quote.cost_amount > 0);

  const quotePdf = await fetch(BASE + `/quotes/${quote.id}/pdf`, { headers: { Authorization: `Bearer ${op}` } });
  const quotePdfBuf = Buffer.from(await quotePdf.arrayBuffer());
  check('Quote PDF is a valid pdf', quotePdfBuf.slice(0, 4).toString() === '%PDF' && quotePdfBuf.length > 2000);

  const revised = await req('POST', `/quotes/${quote.id}/revise`, { token: op });
  check('Quote revision creates version 2', revised.status === 201 && revised.data.version === 2);

  const converted = await req('POST', `/quotes/${quote.id}/convert`, { token: op });
  check('Quote converts to a project', converted.status === 201 && !!converted.data.project?.id);

  // ── 17. DOCUMENT VAULT ──────────────────────────────────────────────────────────
  const vaultPdf = await paymentPdfBuffer('GST Registration Certificate — ARRAYS INGENIERIA PRIVATE LIMITED');
  const fdVault = new FormData();
  fdVault.append('file', blob(vaultPdf, 'application/pdf'), 'gst-cert.pdf');
  fdVault.append('title', 'GST Registration Certificate');
  fdVault.append('category', 'GST Certificate');
  fdVault.append('reference_no', '09ABCDE1234F1Z5');
  fdVault.append('expiry_date', '2027-03-31');
  fdVault.append('tags', 'statutory,gst');
  const vaultDoc = await req('POST', '/vault', { token: op, body: fdVault, raw: true });
  check('Vault document stored (v1)', vaultDoc.status === 201 && vaultDoc.data.version === 1);

  const vaultList = (await req('GET', '/vault', { token: admin })).data;
  check('Vault lists document with expiry status', vaultList.some((d) => d.title === 'GST Registration Certificate' && d.expiry_status));
  const vaultCats = (await req('GET', '/vault/categories', { token: op })).data;
  check('Vault exposes category taxonomy', Array.isArray(vaultCats) && vaultCats.includes('ISO Certificate'));

  // ── 18. DEEPER ANALYTICS ────────────────────────────────────────────────────────
  const vendorSpend = (await req('GET', '/dashboard/vendor-spend', { token: admin })).data;
  check('Analytics: vendor spend populated', Array.isArray(vendorSpend) && vendorSpend.some((v) => v.total_spent > 0));
  const agingA = (await req('GET', '/dashboard/receivable-aging', { token: admin })).data;
  check('Analytics: receivable aging returns 4 buckets', Array.isArray(agingA) && agingA.length === 4);
  const clientRev = (await req('GET', '/dashboard/client-revenue', { token: admin })).data;
  check('Analytics: client revenue populated', Array.isArray(clientRev) && clientRev.some((c) => c.received > 0));

  // ── 19. BRANDING IDENTITY (GST/CIN) ─────────────────────────────────────────────
  check('Company exposes GSTIN + CIN', co.gstin === '10AARCA4610L1ZT' && co.cin === 'U45309DL2018PTC340544');

  // ── 20. IDBI MULTI-LINE BLOCK PARSER (PDF) ──────────────────────────────────────
  // Real IDBI format: date + (wrapped) narration on their own lines, then a
  // single "tail" line carrying Dr./Cr. INR amount timestamp serial balance.
  const idbiBlockText = [
    '01/05/2026', 'IPAY/INST/NEFT/007722800001/32911016237/MONI', 'KUMAR', 'Dr. INR 91,000.00 01/05/2026 17:44:11 1 12,86,583.69',
    '01/05/2026', 'IPAY/INST/NEFT/007722302091/95021400000059/PRABH', 'AT', 'Dr. INR 4,58,000.00 01/05/2026 17:31:55 3 14,22,583.69',
    '01/05/2026', 'HDFCR52026050152692982', 'SOLARGRIDXVENTURESPVTLTD', 'Cr. INR 20,00,000.00 01/05/2026 10:51:05 8 22,07,416.69',
  ].join('\n');
  const blockPdf = await paymentPdfBuffer(idbiBlockText);
  const fdBlock = new FormData();
  fdBlock.append('file', blob(blockPdf, 'application/pdf'), 'idbi-statement.pdf');
  fdBlock.append('label', 'IDBI PDF — May 2026');
  const blockStmt = await req('POST', '/reconciliation/statements', { token: op, body: fdBlock, raw: true });
  check('Multi-line PDF parsed into 3 transaction blocks', blockStmt.data.statement?.total_lines === 3, `got ${blockStmt.data.statement?.total_lines}`);

  const blockLines = (await req('GET', `/reconciliation/statements/${blockStmt.data.statement.id}`, { token: op })).data.lines;
  const lMoni = blockLines.find((l) => l.account_number === '32911016237');
  check('Block: NEFT mode + account parsed from block', lMoni?.mode === 'NEFT' && lMoni?.beneficiary === 'MONI KUMAR', `mode=${lMoni?.mode} ben=${lMoni?.beneficiary}`);
  const lPrabhat = blockLines.find((l) => l.account_number === '95021400000059');
  check('Block: broken name reconstructed PRABH+AT -> PRABHAT', lPrabhat?.beneficiary === 'PRABHAT', `got ${lPrabhat?.beneficiary}`);
  const lCredit = blockLines.find((l) => l.credit > 0);
  check('Block: credit transaction classified (SOLARGRID...)', !!lCredit && /SOLARGRID/.test(lCredit.beneficiary || lCredit.description || ''), `ben=${lCredit?.beneficiary}`);
  check('Block: amounts parsed (91,000 debit)', lMoni?.debit === 91000, `got ${lMoni?.debit}`);

  // ── 21. ONE-CLICK IMPORT MISSING ────────────────────────────────────────────────
  const imp = await req('POST', `/reconciliation/statements/${blockStmt.data.statement.id}/import-missing`, { token: op });
  check('Import-missing created 2 payments + 1 receipt', imp.data.payments === 2 && imp.data.receipts === 1, JSON.stringify(imp.data));
  check('Import-missing auto-created vendor(s)/client(s)', (imp.data.newVendors + imp.data.newClients) >= 2, JSON.stringify(imp.data));

  const candVendors = (await req('GET', '/vendors', { token: op })).data;
  check('Auto-created PRABHAT vendor exists', candVendors.some((v) => v.name === 'PRABHAT'));

  // ── 22. SUBSIDY + ROI CALCULATOR ────────────────────────────────────────────────
  const resCalc = (await req('POST', '/quotes/calculate', { token: op, body: { capacity_kw: 3, project_type: 'residential' } })).data;
  check('Residential 3kW subsidy = ₹78,000 (PM Surya Ghar cap)', resCalc.subsidy_amount === 78000, `got ${resCalc.subsidy_amount}`);
  check('Net cost = total - subsidy', resCalc.net_cost === Math.round((resCalc.total_amount - 78000) * 100) / 100);
  check('ROI: payback years + annual savings computed', resCalc.payback_years > 0 && resCalc.annual_savings > 0);
  const comCalc = (await req('POST', '/quotes/calculate', { token: op, body: { capacity_kw: 100, project_type: 'commercial' } })).data;
  check('Commercial has no auto-subsidy', comCalc.subsidy_amount === 0);

  // ── 23. INVOICE IMPORT (EXTRACT) ────────────────────────────────────────────────
  const invText = ['TAX INVOICE', 'Invoice No: INV-IMP-77', 'Invoice Date: 10/05/2026', 'Taxable Value: 100000.00', 'GST: 18000.00', 'Grand Total: 118000.00'].join('\n');
  const invPdf = await paymentPdfBuffer(invText);
  const fdInv = new FormData();
  fdInv.append('file', blob(invPdf, 'application/pdf'), 'invoice.pdf');
  const invEx = await req('POST', '/invoices/extract', { token: op, body: fdInv, raw: true });
  check('Invoice import extracted number', invEx.data.extracted?.invoice_number === 'INV-IMP-77', `got ${invEx.data.extracted?.invoice_number}`);
  check('Invoice import extracted total = 118000', invEx.data.extracted?.total_amount === 118000, `got ${invEx.data.extracted?.total_amount}`);

  // ── 24. RECONCILIATION REPORT PDF ───────────────────────────────────────────────
  const recPdf = await fetch(BASE + `/reports/reconciliation/${blockStmt.data.statement.id}?format=pdf`, { headers: { Authorization: `Bearer ${admin}` } });
  const recPdfBuf = Buffer.from(await recPdf.arrayBuffer());
  check('Reconciliation report PDF valid', recPdfBuf.slice(0, 4).toString() === '%PDF' && recPdfBuf.length > 2000);

  // ── DONE ─────────────────────────────────────────────────────────────────────
  console.log('\n──────────────── VERIFICATION RESULTS ────────────────');
  console.log(results.join('\n'));
  console.log('───────────────────────────────────────────────────────');
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('VERIFY SCRIPT ERROR:', err);
  process.exit(2);
});
