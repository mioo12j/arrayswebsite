// ============================================================================
//  Bilingual PDF/Excel support — English ⇄ हिन्दी.
//
//  Every downloadable document (e-Invoice, e-Way Bill, quotation, ledger &
//  report exports) can be produced in Hindi. pdfkit's built-in Helvetica has no
//  Devanagari glyphs, so we embed Mukta (Ek Type, OFL) and let fontkit shape the
//  script (matra reordering + conjuncts verified). NOTE: Noto Sans Devanagari
//  was tried first but its GPOS mark-anchor table crashes this fontkit version
//  (null anchor → xCoordinate); Mukta renders cleanly. To avoid editing ~80 label
//  call-sites we monkey-patch a single document: `doc.font()` is remapped to the
//  Devanagari face and `doc.text()` passes its label through a translator. Data
//  values (names, GSTINs, numbers) aren't in the dictionary, so they pass
//  through unchanged — exactly the bilingual-invoice convention used in India.
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
export const DEVA_REGULAR = path.join(FONT_DIR, 'Mukta-Regular.ttf');
export const DEVA_BOLD = path.join(FONT_DIR, 'Mukta-Bold.ttf');

export const normLang = (l) => (String(l || '').toLowerCase().startsWith('hi') ? 'hi' : 'en');

// ── Whole-label dictionary (case-insensitive, exact trimmed match) ───────────
const EXACT = {
  // document titles
  'tax invoice': 'कर बीजक (Tax Invoice)', 'credit note': 'क्रेडिट नोट', 'debit note': 'डेबिट नोट',
  'e-way bill': 'ई-वे बिल', 'quotation': 'कोटेशन (Quotation)',
  'goods in transit document': 'पारगमन में माल का दस्तावेज़', 'not yet generated': 'अभी तक जनरेट नहीं',
  // invoice chrome
  'irn (invoice reference number)': 'IRN (बीजक संदर्भ संख्या)', 'ack no': 'पावती संख्या', 'ack date': 'पावती दिनांक',
  'qr after\nregistration': 'पंजीकरण के\nबाद QR', 'signed qr': 'हस्ताक्षरित QR', 'scan to verify': 'सत्यापन हेतु स्कैन करें',
  'supplier': 'आपूर्तिकर्ता', 'recipient': 'प्राप्तकर्ता', 'consignor': 'प्रेषक', 'consignee': 'परेषिती',
  // item / summary table headers
  'description': 'विवरण', 'product': 'उत्पाद', 'hsn': 'HSN', 'qty': 'मात्रा', 'rate': 'दर',
  'taxable': 'कर योग्य', 'gst%': 'जीएसटी%', 'tax': 'कर', 'total': 'कुल', 'amount': 'राशि',
  'item': 'मद', 'unit': 'इकाई', 'date': 'दिनांक', 'status': 'स्थिति', 'project': 'परियोजना',
  'reference': 'संदर्भ', 'category': 'श्रेणी', 'client': 'ग्राहक', 'vendor': 'विक्रेता', 'type': 'प्रकार',
  'particulars': 'विवरण', 'balance': 'शेष', 'beneficiary': 'लाभार्थी', 'mode': 'माध्यम', 'comment': 'टिप्पणी',
  'remark': 'अभ्युक्ति', 'invoice': 'बीजक', 'invoice #': 'बीजक #', 'payee': 'आदाता', 'received': 'प्राप्त',
  'credited': 'जमा', 'due': 'देय', 'issued': 'जारी', 'budget': 'बजट', 'contract': 'अनुबंध',
  'spent': 'व्यय', 'gross margin': 'सकल मार्जिन', 'dr/cr': 'नामे/जमा', 'tds': 'टीडीएस',
  'retention': 'अवधारण', 'bank beneficiary': 'बैंक लाभार्थी', 'mapped vendor/client': 'मैप किया विक्रेता/ग्राहक',
  'assessable value': 'निर्धारणीय मूल्य', 'cgst': 'सीजीएसटी', 'sgst': 'एसजीएसटी', 'igst': 'आईजीएसटी',
  'cess': 'उपकर', 'round off': 'पूर्णांकन', 'total invoice value': 'कुल बीजक मूल्य', 'hsn / sac summary': 'HSN / SAC सारांश',
  // EWB
  'e-way bill no.': 'ई-वे बिल संख्या', 'generated': 'जनरेट किया', 'valid upto': 'मान्य तिथि तक',
  'part a — supply & document details': 'भाग A — आपूर्ति एवं दस्तावेज़ विवरण',
  'document': 'दस्तावेज़', 'value & distance': 'मूल्य एवं दूरी', 'conveyance': 'वाहन', 'transporter': 'ट्रांसपोर्टर',
  'doc type': 'दस्तावेज़ प्रकार', 'doc no': 'दस्तावेज़ संख्या', 'doc date': 'दस्तावेज़ दिनांक', 'supply': 'आपूर्ति',
  'txn type': 'लेनदेन प्रकार', 'invoice value': 'बीजक मूल्य', 'taxable value': 'कर योग्य मूल्य', 'distance': 'दूरी',
  'vehicle no': 'वाहन संख्या', 'vehicle type': 'वाहन प्रकार', 'name': 'नाम', 'transporter id': 'ट्रांसपोर्टर आईडी',
  'trans doc': 'परिवहन दस्तावेज़', 'active': 'सक्रिय', 'draft': 'प्रारूप', 'cancelled': 'रद्द', 'closed': 'बंद', 'expired': 'समाप्त',
  // quotation
  'system size': 'सिस्टम क्षमता', 'per watt': 'प्रति वाट', 'issue date': 'जारी दिनांक', 'valid until': 'मान्य तिथि तक',
  'site': 'स्थल', 'scope & bill of quantities': 'कार्यक्षेत्र एवं मात्रा विवरण', 'subtotal': 'उप-योग',
  'contingency': 'आकस्मिकता', 'margin': 'मार्जिन', 'gst': 'जीएसटी', 'grand total (incl. gst)': 'सकल योग (जीएसटी सहित)',
  'gross cost': 'सकल लागत', 'govt. subsidy': 'सरकारी सब्सिडी', 'net effective cost': 'निवल प्रभावी लागत',
  'why go solar — returns & environmental impact': 'सौर ऊर्जा क्यों — लाभ एवं पर्यावरणीय प्रभाव',
  'annual savings': 'वार्षिक बचत', 'payback period': 'प्रतिदान अवधि', '25-year savings': '25-वर्षीय बचत',
  'lifetime roi': 'आजीवन ROI', 'clean energy / yr': 'स्वच्छ ऊर्जा / वर्ष', 'co2 avoided / yr': 'CO2 बचत / वर्ष',
  '25-yr co2 avoided': '25-वर्ष CO2 बचत', 'trees equivalent': 'वृक्ष समतुल्य', 'effective cost': 'प्रभावी लागत',
  'technical scope': 'तकनीकी कार्यक्षेत्र', 'commercial terms': 'वाणिज्यिक शर्तें', 'exclusions': 'अपवर्जन',
  'authorised signatory': 'अधिकृत हस्ताक्षरकर्ता', 'authorized signatory': 'अधिकृत हस्ताक्षरकर्ता',
  // report titles
  'outgoing payments report': 'जावक भुगतान रिपोर्ट', 'incoming receipts report': 'आवक प्राप्ति रिपोर्ट',
  'invoices report': 'बीजक रिपोर्ट', 'project profitability report': 'परियोजना लाभप्रदता रिपोर्ट',
  'all dates': 'सभी दिनांक', 'opening balance': 'प्रारंभिक शेष', 'closing balance': 'समापन शेष',
  'billed (dr)': 'बिल (नामे)', 'paid (dr)': 'भुगतान (नामे)', 'received (cr)': 'प्राप्त (जमा)', 'credit (cr)': 'जमा (जमा)',
  'employee': 'कर्मचारी', 'account': 'खाता', 'debit': 'नामे', 'credit': 'जमा',
  // declaration
  'declaration: we declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct. registered on the invoice registration portal (irp) under the gst e-invoicing rules.':
    'घोषणा: हम घोषित करते हैं कि यह बीजक वर्णित वस्तुओं/सेवाओं का वास्तविक मूल्य दर्शाता है तथा सभी विवरण सत्य एवं सही हैं। GST ई-इनवॉइसिंग नियमों के अंतर्गत इनवॉइस रजिस्ट्रेशन पोर्टल (IRP) पर पंजीकृत।',
};

// ── Phrase dictionary for composed strings (`Invoice No: 123`, `Page 1 of 3`) ─
const PHRASE_SRC = {
  'Invoice No': 'बीजक संख्या', 'Reverse Charge': 'रिवर्स चार्ज', 'Supply': 'आपूर्ति', 'Date': 'दिनांक',
  'GSTIN': 'GSTIN', 'State': 'राज्य', 'Outward': 'जावक', 'Inward': 'आवक', 'Road': 'सड़क', 'Rail': 'रेल',
  'Air': 'वायु', 'Ship': 'जहाज़', 'Regular': 'सामान्य', 'Over-Dimensional': 'अति-आयामी',
  'Part B — Transport': 'भाग B — परिवहन', 'pending': 'लंबित', 'continued': 'जारी', 'Page': 'पृष्ठ',
  ' of ': ' / ', 'Rev': 'सं.', 'Yr': 'वर्ष', 'Year': 'वर्ष', 'Yes': 'हाँ', 'No': 'नहीं', 'For ': 'के लिए ',
  'Cumulative Savings over 25 Years (indicative)': '25 वर्षों में संचयी बचत (सांकेतिक)',
  'units': 'यूनिट', 'tonnes': 'टन', 'trees': 'वृक्ष', 'yrs': 'वर्ष', 'km': 'कि.मी.',
};
// Compile to boundary-aware regexes, longest first so 'Doc No' wins over 'No'.
const PHRASES = Object.entries(PHRASE_SRC)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([en, hi]) => {
    const esc = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \b only where the edge is a word char, so ' of ' / 'For ' still match.
    const lead = /^\w/.test(en) ? '\\b' : '';
    const tail = /\w$/.test(en) ? '\\b' : '';
    return [new RegExp(lead + esc + tail, 'g'), hi];
  });

export function translateLabel(s) {
  if (typeof s !== 'string' || !s.trim()) return s;
  const hit = EXACT[s.trim().toLowerCase()];
  if (hit) return hit;
  let out = s;
  for (const [rx, hi] of PHRASES) out = out.replace(rx, hi);
  return out;
}

// ── pdfkit: make one document render Hindi (fonts + auto-translated labels) ──
export function applyPdfLang(doc, lang) {
  if (normLang(lang) !== 'hi') return doc;
  doc.registerFont('__deva', DEVA_REGULAR);
  doc.registerFont('__deva_bold', DEVA_BOLD);
  const origFont = doc.font.bind(doc);
  doc.font = (name, ...rest) => {
    if (name === 'Helvetica') return origFont('__deva', ...rest);
    if (name === 'Helvetica-Bold' || name === 'Helvetica-Oblique') return origFont('__deva_bold', ...rest);
    return origFont(name, ...rest); // Courier (IRN/monospace) stays ASCII
  };
  const origText = doc.text.bind(doc);
  doc.text = (txt, ...rest) => origText(translateLabel(txt), ...rest);
  return doc;
}
