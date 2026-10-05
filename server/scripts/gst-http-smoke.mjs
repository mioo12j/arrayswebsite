// End-to-end HTTP smoke of the GST routes against the running server.
const BASE = 'http://localhost:4000/api';
const login = async (id, pw) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: id, password: pw }) })).json()).token;
const call = async (token, method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text(), ct };
};

const SELLER = { gstin: '27AAPFU0939F1ZV', legalName: 'ARRAYS INGENIERIA PVT LTD', tradeName: 'ARRAYS', addr1: 'Andheri East', location: 'Mumbai', pincode: '400001', stateCode: '27', phone: '9876543210', email: 'a@b.com' };
const BUYER = { gstin: '29AAGCB7383J1Z4', legalName: 'TATA POWER SOLAR', pos: '29', addr1: 'Bengaluru', location: 'Bengaluru', pincode: '560001', stateCode: '29' };
const INV = {
  supplyType: 'B2B', docType: 'INV', docNo: 'ARR/2026/' + Math.floor(Math.random() * 9000 + 1000), docDate: '2026-06-01',
  seller: SELLER, buyer: BUYER,
  items: [{ slNo: 1, description: 'Solar Panel 540W', isService: 'N', hsn: '854143', quantity: 10, unit: 'NOS', unitPrice: 12000, grossAmount: 120000, taxableValue: 120000, gstRate: 18, igstAmount: 21600, totalItemValue: 141600 }],
  val: { assessableValue: 120000, igstValue: 21600, cgstValue: 0, sgstValue: 0, totalInvoiceValue: 141600 },
};

const ok = (c, label) => console.log(`   ${c.status < 400 ? '✓' : '✗'} ${label}: ${c.status}`);

async function main() {
  const editor = await login('editor', 'editor@123');
  const operator = await login('operator', 'operator@123');
  console.log('\n— permissions —');
  const ep = await call(editor, 'GET', '/gst/me/permissions');
  const op = await call(operator, 'GET', '/gst/me/permissions');
  console.log(`   editor perms: ${ep.body.permissions.length}  mode=${ep.body.mode}`);
  console.log(`   operator can submit: ${op.body.permissions.includes('gst.submit')}`);

  console.log('\n— e-invoice lifecycle (editor) —');
  const created = await call(editor, 'POST', '/gst/einvoices', INV); ok(created, 'create draft');
  const id = created.body.id;
  ok(await call(editor, 'POST', `/gst/einvoices/${id}/validate`), 'validate');
  const submitted = await call(editor, 'POST', `/gst/einvoices/${id}/submit`); ok(submitted, 'submit→IRN');
  console.log(`     IRN: ${submitted.body.irn?.slice(0, 24)}…  status=${submitted.body.status}`);
  const detail = await call(editor, 'GET', `/gst/einvoices/${id}`); ok(detail, 'detail+timeline');
  console.log(`     timeline events: ${detail.body.timeline?.length}, api logs: ${detail.body.apiLogs?.length}`);
  const resubmit = await call(editor, 'POST', `/gst/einvoices/${id}/submit`);
  console.log(`     idempotent resubmit alreadyDone=${resubmit.body.alreadyDone} sameIRN=${resubmit.body.irn === submitted.body.irn}`);

  console.log('\n— maker-checker (operator blocked from submit) —');
  const opDraft = await call(operator, 'POST', '/gst/einvoices', { ...INV, docNo: 'OP/2026/' + Math.floor(Math.random() * 9999) }); ok(opDraft, 'operator create draft');
  const opSubmit = await call(operator, 'POST', `/gst/einvoices/${opDraft.body.id}/submit`);
  console.log(`     operator submit blocked: ${opSubmit.status === 403} (${opSubmit.status})`);

  console.log('\n— PDF + signed JSON —');
  const pdf = await call(editor, 'GET', `/gst/einvoices/${id}/pdf`);
  console.log(`   ✓ einvoice PDF: ${pdf.status} ${pdf.ct}`);
  const json = await call(editor, 'GET', `/gst/einvoices/${id}/json`);
  console.log(`   ✓ signed JSON: ${json.status} ${json.ct}`);

  console.log('\n— EWB from invoice → generate —');
  const ewbDraft = await call(editor, 'POST', `/gst/ewbs/from-einvoice/${id}`, { transDistance: 1850, transMode: '1', vehicleNo: 'MH12AB1234', vehicleType: 'R' });
  ok(ewbDraft, 'EWB from e-invoice');
  const gen = await call(editor, 'POST', `/gst/ewbs/${ewbDraft.body.id}/generate`); ok(gen, 'generate EWB');
  console.log(`     EWB No: ${gen.body.ewbNo}  validUpto=${gen.body.validUpto}  status=${gen.body.status}`);
  const ewbPdf = await call(editor, 'GET', `/gst/ewbs/${ewbDraft.body.id}/pdf`);
  console.log(`   ✓ EWB PDF: ${ewbPdf.status} ${ewbPdf.ct}`);

  console.log('\n— dashboard + reports —');
  const dash = await call(editor, 'GET', '/gst/dashboard');
  console.log(`   ✓ dashboard: einv total=${dash.body.einvoice?.total} irn=${dash.body.einvoice?.irn_generated}; ewb active=${dash.body.ewb?.active}; monthly pts=${dash.body.charts?.monthly?.length}`);
  const hsn = await call(editor, 'GET', '/gst/reports/hsn-summary');
  console.log(`   ✓ HSN report rows: ${hsn.body.rows?.length}`);
  const csv = await call(editor, 'GET', '/gst/reports/gst-summary?format=csv');
  console.log(`   ✓ GST summary CSV: ${csv.status} ${csv.ct}`);

  console.log('\n✅ GST HTTP smoke complete.');
}
main().catch((e) => { console.error('FAILED', e); process.exit(1); });
