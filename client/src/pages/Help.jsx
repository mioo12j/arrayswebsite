import { useState } from 'react';
import {
  Rocket, LayoutDashboard, ArrowUpRight, ArrowDownLeft, FileText, Banknote,
  Building2, Users, Calculator, BarChart3, CloudUpload, ShieldCheck, Languages,
  Search, Truck, DatabaseBackup, LifeBuoy, Save, ClipboardList, ReceiptText, UserCog,
  FolderKanban, UserRound, FileCheck2, GitCompareArrows, Activity, BookOpen,
} from 'lucide-react';
import { Card, PageHeader } from '../components/ui/index.jsx';
import { useI18n } from '../context/I18nContext.jsx';

// Each section reads as flowing paragraphs (not bullet points), written for the
// single operator who runs the day-to-day work. Fully bilingual.
const SECTIONS = [
  {
    id: 'start', icon: Rocket,
    en: {
      title: 'Getting started & signing in',
      body: [
        'The software runs on this computer. To start it, open the project folder and launch the app (your IT person usually sets up a one-click shortcut), then open it in your web browser — you will see the sign-in screen. Log in with the ID and password for your account (the ID is a short word like “operator”, not an email).',
        'There are four sign-in roles, each with a clear job. The Editor is the super-admin and can do everything, including all setup and user management. The System Manager is the everyday account that does the real work — payments, receipts, invoices, e-Invoices, e-Way Bills, challans, quotations, vendors and clients, plus uploads and downloads. The Admin is a strict view-only oversight account: it can read every screen but cannot change, import or export anything. The Auditor is a read-only reviewer. You can change your own password any time from the account menu at the top-right.',
        'Finding your way around: the left sidebar groups everything — Operations (payments, receipts, invoices, reconciliation), Ledgers (vendors, employees, clients), Sales & Delivery (quotes, challans, projects), GST e-Invoicing, Setup, and Intelligence (reports, activity, backup, recovery). The bar across the top has a universal search box, the language switch (EN / हिं), the active office/branch selector on GST screens, and your account menu (one-click backup, Change Password, sign out). A thin coloured strip at the very top shows the current status (e.g. “Live — offline filing”).',
      ],
    },
    hi: {
      title: 'शुरुआत करें और साइन इन करें',
      body: [
        'यह सॉफ़्टवेयर इसी कंप्यूटर पर चलता है। इसे शुरू करने के लिए प्रोजेक्ट फ़ोल्डर खोलें और ऐप चालू करें (आपका आईटी व्यक्ति आमतौर पर एक-क्लिक शॉर्टकट बना देता है), फिर इसे वेब ब्राउज़र में खोलें — आपको साइन-इन स्क्रीन दिखेगी। अपने खाते की ID और पासवर्ड से लॉगिन करें (ID एक छोटा शब्द है जैसे “operator”, ईमेल नहीं)।',
        'चार साइन-इन भूमिकाएँ हैं, हर एक का स्पष्ट काम। Editor सुपर-एडमिन है और सब कुछ कर सकता है, सभी सेटअप व उपयोगकर्ता-प्रबंधन सहित। System Manager रोज़मर्रा का खाता है जो असली काम करता है — भुगतान, प्राप्तियाँ, इनवॉइस, e-Invoice, e-Way Bill, चालान, कोटेशन, विक्रेता व ग्राहक, साथ ही अपलोड व डाउनलोड। Admin एक सख़्त केवल-दृश्य निगरानी खाता है: हर स्क्रीन पढ़ सकता है पर कुछ बदल/आयात/निर्यात नहीं कर सकता। Auditor केवल-पठन समीक्षक है। आप अपना पासवर्ड कभी भी ऊपर-दाईं ओर खाता मेनू से बदल सकते हैं।',
        'रास्ता ढूँढना: बायाँ साइडबार सब कुछ समूहित करता है — Operations (भुगतान, प्राप्तियाँ, इनवॉइस, समाधान), Ledgers (विक्रेता, कर्मचारी, ग्राहक), Sales & Delivery (कोटेशन, चालान, परियोजनाएँ), GST e-Invoicing, Setup, और Intelligence (रिपोर्ट, गतिविधि, बैकअप, रिकवरी)। ऊपर की पट्टी में सार्वभौमिक खोज बॉक्स, भाषा स्विच (EN / हिं), GST स्क्रीन पर सक्रिय कार्यालय/शाखा चयनकर्ता, और आपका खाता मेनू (एक-क्लिक बैकअप, Change Password, साइन आउट) है। सबसे ऊपर एक पतली रंगीन पट्टी वर्तमान स्थिति दिखाती है (जैसे “Live — offline filing”)।',
      ],
    },
  },
  {
    id: 'operate', icon: UserCog,
    en: {
      title: 'How you work — direct, no approvals',
      body: [
        'For the System Manager (and the Editor) there are no approval queues, no “pending manager sign-off” and no waiting. Whenever you create or change something — a delivery challan, an invoice, an e-Invoice, a vendor, a client or a payment — it saves immediately and is yours to use right away. The flow is meant to be fast: open the screen, fill the form, save, move on.',
        'Even with no approvals, every action is recorded permanently in the audit trail (who did what and when), and the system protects your work in the background: it warns you before you leave a half-finished form, quietly auto-saves a draft so a crash or power-cut never loses your typing, and takes an automatic backup of everything every two hours.',
        'A normal day looks like this: sign in, glance at the Dashboard, enter the day’s payments and receipts, raise any invoices or e-Invoices, reconcile the bank when a statement arrives, download whatever you need to send out, and take a backup before signing out (the app offers one automatically at sign-out). Everything lives on this computer and works fully offline — the only steps that need the internet are uploading the GST JSON on the government portal and, optionally, “Publish to Cloud” so the read-only admin view stays current.',
      ],
    },
    hi: {
      title: 'आप कैसे काम करते हैं — सीधे, बिना मंज़ूरी',
      body: [
        'System Manager (और Editor) के लिए कोई मंज़ूरी कतार नहीं, कोई “मैनेजर की स्वीकृति बाकी” नहीं, और कोई प्रतीक्षा नहीं। जब भी आप कुछ बनाते या बदलते हैं — चालान, इनवॉइस, e-Invoice, विक्रेता, ग्राहक या भुगतान — वह तुरंत सहेजा जाता है और तुरंत उपयोग के लिए तैयार होता है। प्रवाह तेज़ रखा गया है: स्क्रीन खोलें, फ़ॉर्म भरें, सहेजें, आगे बढ़ें।',
        'मंज़ूरी न होने पर भी, हर क्रिया स्थायी रूप से ऑडिट ट्रेल में दर्ज होती है (किसने, क्या, कब किया), और सिस्टम पृष्ठभूमि में आपके काम की रक्षा करता है: अधूरा फ़ॉर्म छोड़ने से पहले चेतावनी देता है, ड्राफ्ट चुपचाप स्वतः सहेजता है ताकि क्रैश या बिजली-कटौती में टाइपिंग न खोए, और हर दो घंटे में सब कुछ का स्वतः बैकअप लेता है।',
        'सामान्य दिन ऐसा दिखता है: साइन-इन करें, डैशबोर्ड पर नज़र डालें, दिन के भुगतान व प्राप्तियाँ दर्ज करें, कोई इनवॉइस या e-Invoice बनाएँ, स्टेटमेंट आने पर बैंक समाधान करें, भेजने हेतु जो चाहिए डाउनलोड करें, और साइन आउट से पहले बैकअप लें (ऐप साइन-आउट पर स्वतः सुझाव देता है)। सब कुछ इसी कंप्यूटर पर रहता है और पूरी तरह ऑफ़लाइन काम करता है — केवल GST JSON को सरकारी पोर्टल पर अपलोड करना और वैकल्पिक रूप से “Publish to Cloud” करना ही इंटरनेट माँगते हैं।',
      ],
    },
  },
  {
    id: 'dashboard', icon: LayoutDashboard,
    en: {
      title: 'The Dashboard',
      body: [
        'The Dashboard is your home screen and a quick health-check of the business. The top rows show live money figures — total paid out, total received, pending receivables and your net position — followed by counts of pending invoices, payments still waiting for an invoice, reconciliation pending and active projects.',
        'Below that, a “Production & Data” strip shows how much you have on record (vendors, offices, invoices, e-invoices, challans, e-way bills), when the last backup ran and how healthy it is, how much storage is used, and when you last published to the cloud. Click any tile to jump straight into that area.',
        'Read the Dashboard top-to-bottom each morning as a one-minute check: the money figures tell you the cash position, the pending counts tell you what needs doing today (invoices to raise, payments awaiting a bill, reconciliations to clear), and the backup tile tells you whether your work is safely protected. If a number looks wrong, click through to the underlying list — every tile is a shortcut, so the Dashboard doubles as the fastest way to navigate the whole software.',
      ],
    },
    hi: {
      title: 'डैशबोर्ड',
      body: [
        'डैशबोर्ड आपकी होम स्क्रीन और व्यवसाय की त्वरित जाँच है। ऊपर की पंक्तियाँ लाइव धन आँकड़े दिखाती हैं — कुल भुगतान, कुल प्राप्ति, लंबित प्राप्य और शुद्ध स्थिति — फिर लंबित इनवॉइस, इनवॉइस की प्रतीक्षा कर रहे भुगतान, लंबित समाधान और सक्रिय परियोजनाओं की गिनती।',
        'उसके नीचे, “Production & Data” पट्टी दिखाती है कि आपके पास कितना रिकॉर्ड है (विक्रेता, कार्यालय, इनवॉइस, e-invoice, चालान, e-way bill), अंतिम बैकअप कब चला और कितना स्वस्थ है, कितना स्टोरेज उपयोग हुआ, और आपने आख़िरी बार क्लाउड पर कब प्रकाशित किया। किसी भी टाइल पर क्लिक कर सीधे उस क्षेत्र में जाएँ।',
        'हर सुबह डैशबोर्ड को ऊपर-से-नीचे एक-मिनट की जाँच के रूप में पढ़ें: धन आँकड़े नकद स्थिति बताते हैं, लंबित गिनती बताती है कि आज क्या करना है (इनवॉइस बनाना, बिल की प्रतीक्षा वाले भुगतान, साफ़ करने योग्य समाधान), और बैकअप टाइल बताती है कि आपका काम सुरक्षित है या नहीं। कोई संख्या गलत लगे तो उसकी अंतर्निहित सूची पर क्लिक करें — हर टाइल एक शॉर्टकट है, इसलिए डैशबोर्ड पूरे सॉफ़्टवेयर में जाने का सबसे तेज़ रास्ता भी है।',
      ],
    },
  },
  {
    id: 'payments', icon: ArrowUpRight,
    en: {
      title: 'Outgoing Payments (money you pay out)',
      body: [
        'Open “Outgoing Payments” to record money leaving the business. Click New, choose whether you are paying a vendor or an employee, pick the name, and enter the amount and date. You can tag the payment to a project, site, category and material so costs roll up correctly in reports and project profitability.',
        'If the money relates to a purchase, mark whether the vendor’s invoice has been received and attach the bill. When you later import a bank statement, the system matches each transaction to the right vendor automatically using the account number, so your books and the bank stay in step.',
        'Each payment also carries two free-text fields that are easy to confuse but useful kept apart: the Remark is what actually happened in the bank (for example “RTGS to Steelworks”), while the Comment is your own internal note. Click any payment in the list to open its full detail, see the linked vendor, project and attachment, and edit or delete it — nothing needs anyone’s approval. Use the date presets and the Excel/PDF buttons to export exactly the slice you are looking at.',
      ],
    },
    hi: {
      title: 'जावक भुगतान (जो पैसा आप देते हैं)',
      body: [
        '“जावक भुगतान” खोलकर व्यवसाय से जाने वाला पैसा दर्ज करें। New पर क्लिक करें, चुनें कि आप विक्रेता को दे रहे हैं या कर्मचारी को, नाम चुनें, और राशि व दिनांक भरें। भुगतान को परियोजना, साइट, श्रेणी और सामग्री से जोड़ें ताकि लागत रिपोर्ट और परियोजना लाभप्रदता में सही जुड़े।',
        'यदि पैसा किसी खरीद से जुड़ा है, तो चिह्नित करें कि विक्रेता का बिल मिला या नहीं और बिल संलग्न करें। बाद में बैंक स्टेटमेंट आयात करने पर, सिस्टम खाता संख्या से हर लेनदेन को सही विक्रेता से स्वतः मिलाता है, ताकि आपकी बही और बैंक मेल खाते रहें।',
        'हर भुगतान में दो मुक्त-पाठ फ़ील्ड होते हैं जिन्हें अलग रखना उपयोगी है: Remark वह है जो बैंक में वास्तव में हुआ (उदा. “RTGS to Steelworks”), जबकि Comment आपका अपना आंतरिक नोट है। सूची में किसी भी भुगतान पर क्लिक कर उसका पूरा विवरण खोलें, जुड़ा विक्रेता, परियोजना व संलग्नक देखें, और संपादित या हटाएँ — किसी की मंज़ूरी की ज़रूरत नहीं। दिनांक प्रीसेट और Excel/PDF बटन से ठीक वही हिस्सा निर्यात करें जो आप देख रहे हैं।',
      ],
    },
  },
  {
    id: 'receipts', icon: ArrowDownLeft,
    en: {
      title: 'Incoming Receipts (money you receive)',
      body: [
        'Open “Incoming Receipts” to record money coming in from clients. Enter the client, the credited amount and date, and link it to the invoice it settles. You can capture deductions such as TDS, retention and other amounts separately so the true outstanding on each invoice stays accurate.',
        'As receipts are linked, each invoice automatically moves from raised to partially paid to paid, and the client’s outstanding balance updates on its own — so you always know who still owes you and how much.',
        'Recording the deductions correctly matters: a client may pay you the net amount after holding back TDS or a retention, and entering those separately means the invoice is treated as fully settled rather than showing a phantom outstanding for the held-back portion. Click any receipt to open its detail, see the invoice it is against and any attached proof, and the client ledger then shows the whole story — invoice raised on this date, payment received on that date, balance remaining.',
      ],
    },
    hi: {
      title: 'आवक प्राप्तियाँ (जो पैसा आपको मिलता है)',
      body: [
        '“आवक प्राप्तियाँ” खोलकर ग्राहकों से आने वाला पैसा दर्ज करें। ग्राहक, जमा राशि व दिनांक भरें और जिस इनवॉइस का निपटान है उससे जोड़ें। TDS, अवधारण (retention) और अन्य कटौतियाँ अलग से दर्ज करें ताकि हर इनवॉइस का वास्तविक बकाया सही रहे।',
        'जैसे-जैसे प्राप्तियाँ जुड़ती हैं, हर इनवॉइस स्वतः raised → आंशिक भुगतान → भुगतान में बदलती है, और ग्राहक का बकाया स्वयं अपडेट होता है — इसलिए आपको हमेशा पता रहता है कि किस पर कितना बकाया है।',
        'कटौतियाँ सही दर्ज करना महत्वपूर्ण है: ग्राहक TDS या अवधारण रोककर शुद्ध राशि दे सकता है, और उन्हें अलग दर्ज करने का अर्थ है कि इनवॉइस पूरी तरह निपटा माना जाए, न कि रोकी राशि के लिए झूठा बकाया दिखे। किसी भी प्राप्ति पर क्लिक कर उसका विवरण, जुड़ा इनवॉइस और संलग्न प्रूफ़ देखें; ग्राहक बही फिर पूरी कहानी दिखाती है — इनवॉइस इस दिनांक को बना, भुगतान उस दिनांक को मिला, शेष बकाया।',
      ],
    },
  },
  {
    id: 'reconciliation', icon: Banknote,
    en: {
      title: 'Bank Reconciliation',
      body: [
        'Open “Bank Reconciliation” and import your bank statement (the IDBI format is understood automatically, even multi-line entries). The system reads every transaction, then matches it to the right vendor or client using the account number and beneficiary name, marking each line as matched or needing a quick review.',
        'Where it cannot decide, you map the account to a vendor once and it will remember that mapping for every future statement. This keeps the software’s records and the actual bank perfectly aligned, and surfaces any payment or receipt you may have forgotten to enter.',
        'Work the list top to bottom: confirm the auto-matched lines, and for the rest either map the account to the right party or — for a genuinely new transaction — create the payment or receipt straight from that line so nothing slips through. Each line shows debit or credit, the amount, the beneficiary and a status (matched / needs review), and the whole reconciliation can be exported to Excel or PDF for your records. Because mappings are remembered, the first statement takes the most effort and every month after is largely automatic.',
      ],
    },
    hi: {
      title: 'बैंक समाधान',
      body: [
        '“बैंक समाधान” खोलकर अपना बैंक स्टेटमेंट आयात करें (IDBI प्रारूप, यहाँ तक कि बहु-पंक्ति प्रविष्टियाँ भी, स्वतः समझा जाता है)। सिस्टम हर लेनदेन पढ़ता है, फिर खाता संख्या और लाभार्थी नाम से उसे सही विक्रेता/ग्राहक से मिलाता है, और हर पंक्ति को मिलान हुआ या त्वरित समीक्षा चाहिए के रूप में चिह्नित करता है।',
        'जहाँ निर्णय न हो पाए, वहाँ खाते को एक बार विक्रेता से मैप करें और वह हर भविष्य के स्टेटमेंट के लिए याद रखेगा। इससे सॉफ़्टवेयर के रिकॉर्ड और वास्तविक बैंक पूरी तरह मेल खाते हैं, और कोई भूला हुआ भुगतान/प्राप्ति सामने आ जाती है।',
        'सूची को ऊपर-से-नीचे निपटाएँ: स्वतः-मिलान पंक्तियों की पुष्टि करें, और बाकी के लिए या तो खाते को सही पक्ष से मैप करें या — किसी सचमुच नए लेनदेन हेतु — उसी पंक्ति से भुगतान/प्राप्ति सीधे बनाएँ ताकि कुछ छूटे नहीं। हर पंक्ति डेबिट/क्रेडिट, राशि, लाभार्थी और स्थिति (मिलान/समीक्षा चाहिए) दिखाती है, और पूरा समाधान रिकॉर्ड हेतु Excel/PDF में निर्यात किया जा सकता है। चूँकि मैपिंग याद रहती है, पहला स्टेटमेंट सबसे अधिक मेहनत लेता है और उसके बाद हर महीना काफ़ी हद तक स्वतः होता है।',
      ],
    },
  },
  {
    id: 'vendors', icon: Building2,
    en: {
      title: 'Vendors',
      body: [
        'The Vendor Master holds every supplier you pay, with their GSTIN, bank account and IFSC. Each vendor can have more than one bank account, and these accounts are what the bank-reconciliation matching uses — so keeping them accurate means statements match themselves.',
        'You can add a vendor at any time, and new vendors are also created automatically when you import a beneficiary list or a bank statement that mentions someone not yet on file. Open any vendor to see its full ledger — everything you have paid them, running balance included.',
        'A vendor ledger is read as a pure payables account, not a loan: a vendor never “owes you”. What the ledger calls Balance Payable is simply what you still owe them; if you have paid ahead of their bills it shows as an advance to adjust against future bills, and money a vendor sends back is a refund that reduces your net paid — never a debt in your favour. Each vendor page also shows its GST validation status and offers Excel / PDF export of the ledger.',
      ],
    },
    hi: {
      title: 'विक्रेता',
      body: [
        'विक्रेता मास्टर में हर आपूर्तिकर्ता होता है जिसे आप भुगतान करते हैं — उसके GSTIN, बैंक खाते और IFSC के साथ। हर विक्रेता के एक से अधिक बैंक खाते हो सकते हैं, और यही खाते बैंक-समाधान मिलान में उपयोग होते हैं — इसलिए इन्हें सही रखने से स्टेटमेंट स्वयं मेल खाते हैं।',
        'आप कभी भी विक्रेता जोड़ सकते हैं, और जब आप लाभार्थी सूची या बैंक स्टेटमेंट आयात करते हैं जिसमें कोई नया नाम हो, तो नए विक्रेता स्वतः बन जाते हैं। किसी भी विक्रेता को खोलकर उसकी पूरी बही देखें — आपने उसे जो भुगतान किया, चालू शेष सहित।',
        'विक्रेता बही को शुद्ध देय (payables) खाते के रूप में पढ़ा जाता है, ऋण के रूप में नहीं: विक्रेता आप पर कभी “बकाया” नहीं रखता। बही जिसे Balance Payable कहती है वह केवल वह है जो आप अब भी उन्हें देना है; यदि आपने उनके बिलों से आगे भुगतान कर दिया तो वह भविष्य के बिलों में समायोजित होने वाला अग्रिम दिखता है, और विक्रेता द्वारा लौटाया पैसा एक रिफ़ंड है जो आपके शुद्ध भुगतान को घटाता है — कभी आपके पक्ष में ऋण नहीं। हर विक्रेता पृष्ठ उसकी GST सत्यापन स्थिति भी दिखाता है और बही का Excel / PDF निर्यात देता है।',
      ],
    },
  },
  {
    id: 'clients', icon: Users,
    en: {
      title: 'Clients',
      body: [
        'Clients are the customers you bill. Keep each client’s name, GSTIN and address on file so they flow straight into invoices and e-invoices without retyping. Add a client once and it is available everywhere a customer is needed.',
        'Opening a client shows its full ledger, and it is built around the invoice → payment story so collections are always clear. Each row shows what was billed or received, the invoice the payment is against, the date the invoice was raised and the date the money came in, with a running balance — so for any payment you can see exactly which invoice it settled and how much of that invoice is still open. The three summary cards on top give Total Billed, Total Received and Outstanding at a glance.',
        'The same page carries a read-only GST compliance panel (e-invoices, IRNs and GST value linked to that client’s GSTIN), and Excel / PDF buttons to export the whole statement in English or Hindi — useful to send a client their account or to attach to a follow-up.',
      ],
    },
    hi: {
      title: 'ग्राहक',
      body: [
        'ग्राहक वे हैं जिन्हें आप बिल करते हैं। हर ग्राहक का नाम, GSTIN और पता रखें ताकि वे बिना दोबारा टाइप किए सीधे इनवॉइस और e-invoice में आ जाएँ। ग्राहक एक बार जोड़ें — फिर वह हर जगह उपलब्ध रहता है जहाँ ग्राहक चाहिए।',
        'ग्राहक खोलने पर उसकी पूरी बही दिखती है, और यह इनवॉइस → भुगतान कहानी के इर्द-गिर्द बनी है ताकि वसूली हमेशा स्पष्ट रहे। हर पंक्ति दिखाती है क्या बिल हुआ या प्राप्त हुआ, भुगतान किस इनवॉइस के विरुद्ध है, इनवॉइस किस दिनांक को बना और पैसा किस दिनांक को आया, चालू शेष सहित — इसलिए किसी भी भुगतान के लिए आप ठीक देख सकते हैं कि उसने कौन-सा इनवॉइस निपटाया और उस इनवॉइस का कितना बकाया है। ऊपर तीन सारांश कार्ड कुल बिल, कुल प्राप्त और बकाया एक नज़र में देते हैं।',
        'वही पृष्ठ एक केवल-पठन GST अनुपालन पैनल रखता है (उस ग्राहक के GSTIN से जुड़े e-invoice, IRN व GST मूल्य), और पूरी स्टेटमेंट अंग्रेज़ी या हिंदी में निर्यात हेतु Excel / PDF बटन — ग्राहक को उसका खाता भेजने या फॉलो-अप के साथ संलग्न करने में उपयोगी।',
      ],
    },
  },
  {
    id: 'invoices', icon: ReceiptText,
    en: {
      title: 'Invoices — standard and e-Invoice in one place',
      body: [
        'The Invoices screen shows two kinds of bill side by side, clearly colour-coded: a blue “Standard Invoice” badge for normal commercial bills, and a green “GST E-Invoice” badge for those registered on the government portal (with an IRN). The columns tell you the number, type, customer, date, amount, status, any linked e-way bill and who created it.',
        'To raise a standard invoice click New Invoice, pick the customer (or type a name and GSTIN), set the place of supply, and add items line by line with HSN, quantity, rate and GST percent. The software works out CGST and SGST for a sale within your state, or IGST for another state, and shows the running total live. Mark it Draft, Issued or Cancelled, add notes, and you are done — no approval needed.',
        'Invoices and e-way bills stay connected both ways. From an invoice you can link an existing e-way bill or create one from it; opening either record shows the other, so the goods movement and the bill are never out of sync.',
        'Every invoice downloads as a clean, branded PDF in English or Hindi, with the amount in words and your bank details printed for payment. A standard invoice can be edited or cancelled at any time; a GST e-Invoice, once it has an IRN, is locked except for the cosmetic letterhead — to create one you use the GST e-Invoicing workspace and follow the offline filing steps (see “e-Invoicing step by step”). The list’s search and status filters make it easy to pull up a single bill, or every unpaid invoice for one client, in seconds.',
      ],
    },
    hi: {
      title: 'इनवॉइस — स्टैंडर्ड और e-Invoice एक ही जगह',
      body: [
        'इनवॉइस स्क्रीन दो तरह के बिल साथ-साथ दिखाती है, स्पष्ट रंग-कोडित: सामान्य व्यापारिक बिलों के लिए नीला “Standard Invoice” बैज, और सरकारी पोर्टल पर पंजीकृत (IRN वाले) के लिए हरा “GST E-Invoice” बैज। कॉलम बताते हैं — संख्या, प्रकार, ग्राहक, दिनांक, राशि, स्थिति, जुड़ा e-way bill और किसने बनाया।',
        'स्टैंडर्ड इनवॉइस बनाने के लिए New Invoice पर क्लिक करें, ग्राहक चुनें (या नाम व GSTIN टाइप करें), आपूर्ति का स्थान चुनें, और मदें एक-एक कर HSN, मात्रा, दर व GST% सहित जोड़ें। अपने राज्य के भीतर बिक्री पर सॉफ़्टवेयर CGST+SGST और दूसरे राज्य पर IGST निकालता है, और कुल लाइव दिखाता है। इसे Draft, Issued या Cancelled चिह्नित करें, टिप्पणी जोड़ें — बस हो गया, किसी मंज़ूरी की ज़रूरत नहीं।',
        'इनवॉइस और e-way bill दोनों तरफ़ से जुड़े रहते हैं। इनवॉइस से आप मौजूदा e-way bill जोड़ सकते हैं या नया बना सकते हैं; कोई भी रिकॉर्ड खोलने पर दूसरा दिखता है, ताकि माल की आवाजाही और बिल कभी अलग न हों।',
        'हर इनवॉइस अंग्रेज़ी या हिंदी में एक साफ़, ब्रांडेड PDF के रूप में डाउनलोड होता है — राशि शब्दों में और भुगतान हेतु आपके बैंक विवरण सहित। स्टैंडर्ड इनवॉइस कभी भी संपादित/रद्द किया जा सकता है; GST e-Invoice में IRN आने के बाद वह केवल कॉस्मेटिक लेटरहेड को छोड़कर लॉक हो जाता है — उसे बनाने हेतु GST e-Invoicing कार्यक्षेत्र का उपयोग करें और ऑफ़लाइन फाइलिंग चरण अपनाएँ (“e-Invoicing चरण-दर-चरण” देखें)। सूची की खोज व स्थिति-फ़िल्टर से एक बिल, या किसी एक ग्राहक के सभी बकाया इनवॉइस, सेकंडों में निकालें।',
      ],
    },
  },
  {
    id: 'challans', icon: ClipboardList,
    en: {
      title: 'Delivery Challans',
      body: [
        'A delivery challan moves goods when you are not raising a tax invoice yet — job work, branch or warehouse transfer, repair, testing, demonstration, exhibition, goods on approval, returnable packaging and similar movements allowed under GST Rule 55. Open “Delivery Challans”, click New Challan, choose the type, and fill the consignor (from) and consignee (to) details.',
        'Add the goods with HSN, quantity, rate and GST, and the software decides CGST+SGST or IGST and shows the live total. Enter the transport details and any e-way bill number. There are no approvals: save and dispatch directly. Afterwards mark the challan delivered with the receiver’s name, record a return if goods come back, generate a linked e-way bill, or convert the challan into a tax invoice — the link between them is kept. Download the challan PDF (English or Hindi) to send with the vehicle.',
        'A challan is not a tax invoice and does not register an IRN — it simply documents a movement of goods, which is exactly why it is the right tool for transfers and job work. Its lifecycle is easy to follow on the detail screen: draft → dispatched → delivered (or returned), each step time-stamped in the history. If the consignment crosses the e-way-bill value threshold, generate the linked e-way bill before the vehicle leaves; and when you finally bill those goods, convert the challan into a tax invoice so the items are never re-keyed.',
      ],
    },
    hi: {
      title: 'डिलीवरी चालान',
      body: [
        'डिलीवरी चालान तब माल भेजता है जब आप अभी टैक्स इनवॉइस नहीं बना रहे — जॉब वर्क, शाखा/गोदाम स्थानांतरण, मरम्मत, परीक्षण, प्रदर्शन, प्रदर्शनी, अनुमोदन पर माल, वापसी योग्य पैकेजिंग आदि (GST नियम 55)। “Delivery Challans” खोलें, New Challan पर क्लिक करें, प्रकार चुनें, और भेजने वाले (from) व पाने वाले (to) का विवरण भरें।',
        'माल को HSN, मात्रा, दर व GST सहित जोड़ें; सॉफ़्टवेयर CGST+SGST या IGST तय करता है और कुल लाइव दिखाता है। परिवहन विवरण और कोई e-way bill संख्या भरें। कोई मंज़ूरी नहीं: सीधे सहेजें और डिस्पैच करें। बाद में पाने वाले का नाम लेकर डिलीवर चिह्नित करें, माल लौटने पर वापसी दर्ज करें, जुड़ा e-way bill बनाएँ, या चालान को टैक्स इनवॉइस में बदलें — दोनों का संबंध सुरक्षित रहता है। वाहन के साथ भेजने हेतु चालान PDF (अंग्रेज़ी या हिंदी) डाउनलोड करें।',
        'चालान टैक्स इनवॉइस नहीं है और IRN पंजीकृत नहीं करता — यह केवल माल की आवाजाही दर्ज करता है, इसीलिए स्थानांतरण व जॉब वर्क हेतु यही सही उपकरण है। इसका जीवनचक्र विवरण स्क्रीन पर आसानी से दिखता है: draft → dispatched → delivered (या returned), हर चरण इतिहास में समयांकित। यदि खेप e-way-bill मूल्य-सीमा पार करती है, तो वाहन निकलने से पहले जुड़ा e-way bill बनाएँ; और जब आप अंततः उस माल का बिल बनाएँ, तो चालान को टैक्स इनवॉइस में बदलें ताकि मदें दोबारा टाइप न हों।',
      ],
    },
  },
  {
    id: 'quotes', icon: Calculator,
    en: {
      title: 'Quotations, BOQ & solar proposals',
      body: [
        'Open “Quotes & Estimation” and click New Quotation. Enter the client, the system size in kW, and the project type. The builder has three parts that stay in perfect sync with each other: Rate Assumptions (your costs) on the left, the Live Estimate summary on the right, and the full-width Bill of Quantities table below. Change anything in one place and the other two update instantly — the number you see is always the number you get.',
        'Rate Assumptions are your COST rates, entered per watt (₹/W) for each kind of work: inverter, mounting structure, cabling + earthing + balance-of-system, civil, installation & commissioning, transport — and the module rate either per watt or per module. A rate of, say, ₹4/W means ₹4 × the total watts (a 25 kW system is 25,000 watts, so ₹4/W = ₹1,00,000). A small Panel Rate Calculator lets you type ₹/W × wattage to get the price per panel (e.g. ₹17 × 545 = ₹9,265). Next to the rates you set your Margin % and the Margin Distribution — tick which buckets your margin should be loaded into (Civil, Installation, or any category, and “Other items” for the rest) and set each share; the default is 40% Civil, 40% Installation, 20% Other. Your margin is folded into the item rates and is NEVER shown to the client — you can see your margin and its split only inside the software.',
        'The Bill of Quantities is where you build the quote. Turn on “Custom items” to write your own lines, or click “Load standard items” to start from the standard set. For each line you write any Description the client should see (it wraps to as many lines as you need), then tick one or more “Rate from” boxes to tell the system which rate assumption(s) to cost it at — their per-watt rates add up (Structure ₹3.5 + Cabling ₹4 = ₹7.5/W). A rate category can be used on only one line, so it can never be double-counted (it greys out elsewhere once used). Each line shows Rate (assumed) with the working, + Margin folded in, and the final Amount — all as BASIC prices (before GST). The running Subtotal, Margin and Total sit right under the table so you never have to scroll up. Tick nothing on a line to type a manual rate for a one-off item.',
        'Because GST is only collected on behalf of the government and is not your money, every price is quoted on the BASIC value. The Live Estimate shows Subtotal (actuals) → Margin → Taxable Value (basic), then GST, then the Grand Total including GST — and the per-watt price is shown both ways: ₹/W basic (what you actually quote on) and ₹/W including GST. In the “Commercial Terms & Company” panel you set what the client sees on the quotation: the System Configuration (module type such as “545 Wp Mono PERC”, panel type DCR / Non-DCR, inverter type, mounting, total DC capacity, and whether Net Metering and Battery Backup are included — both default to “Not included”, since those carry separate licensing and charges), the payment schedule, terms, scope of work, exclusions, and any Extra Technical Requirements / Notes.',
        'Use the Documents button to download the branded PDF pack — the premium Proposal brochure, the Commercial Quotation (priced offer, scope, terms, your bank details and the client’s acceptance signature) and the component-level Bill of Quantities — together or separately, in English or Hindi. A quote is a living document: Save it, Revise it (each revision is a new version), and when it is agreed, Approve it and then Convert it into a live project. If you approved or converted by mistake, click Undo — it asks you to write a short reason (e.g. “client changed the scope”), sends the quote back to draft so you can edit it, and safely removes the project it created (kept if that project already has real activity). Every step is recorded in the audit trail.',
      ],
    },
    hi: {
      title: 'कोटेशन, BOQ और सौर प्रस्ताव',
      body: [
        '“कोटेशन और अनुमान” खोलकर New Quotation पर क्लिक करें। ग्राहक, सिस्टम आकार (kW) और परियोजना प्रकार भरें। बिल्डर के तीन भाग हैं जो आपस में पूरी तरह सिंक रहते हैं: बाईं ओर Rate Assumptions (आपकी लागत), दाईं ओर Live Estimate सारांश, और नीचे पूरी-चौड़ाई वाली Bill of Quantities तालिका। किसी एक जगह बदलाव करें तो बाकी दो तुरंत अपडेट होते हैं — जो संख्या दिखती है वही मिलती है।',
        'Rate Assumptions आपकी लागत दरें हैं, हर काम के लिए प्रति-वाट (₹/W): इन्वर्टर, माउंटिंग स्ट्रक्चर, केबलिंग + अर्थिंग + BOS, सिविल, स्थापना व कमीशनिंग, परिवहन — और मॉड्यूल दर प्रति-वाट या प्रति-मॉड्यूल। जैसे ₹4/W का अर्थ है ₹4 × कुल वाट (25 kW = 25,000 वाट, तो ₹4/W = ₹1,00,000)। एक छोटा Panel Rate Calculator ₹/W × वाट से प्रति-पैनल मूल्य देता है (जैसे ₹17 × 545 = ₹9,265)। दरों के पास अपना Margin % और Margin Distribution सेट करें — टिक करें कि मार्जिन कहाँ लोड हो (Civil, Installation, कोई भी श्रेणी, और बाकी के लिए “Other items”) और हर हिस्सा सेट करें; डिफ़ॉल्ट 40% Civil, 40% Installation, 20% Other है। आपका मार्जिन आइटम दरों में मिला दिया जाता है और ग्राहक को कभी नहीं दिखता — मार्जिन व उसका बँटवारा केवल सॉफ़्टवेयर में दिखता है।',
        'Bill of Quantities में आप कोटेशन बनाते हैं। “Custom items” चालू करके अपनी पंक्तियाँ लिखें, या “Load standard items” से मानक सेट से शुरू करें। हर पंक्ति में ग्राहक हेतु कोई भी Description लिखें (यह कई पंक्तियों में लपेटता है), फिर एक या अधिक “Rate from” बॉक्स टिक करें ताकि सिस्टम जान सके किस रेट असम्पशन से लागत लगानी है — उनकी प्रति-वाट दरें जुड़ती हैं (Structure ₹3.5 + Cabling ₹4 = ₹7.5/W)। एक रेट श्रेणी केवल एक पंक्ति में उपयोग हो सकती है, अतः दोहरी गिनती असंभव है (उपयोग होने पर अन्यत्र धूसर हो जाती है)। हर पंक्ति दिखाती है Rate (assumed) गणना सहित, + Margin मिला हुआ, और अंतिम Amount — सब BASIC मूल्य (GST से पहले)। चालू Subtotal, Margin व Total तालिका के ठीक नीचे रहते हैं। किसी पंक्ति पर कुछ न टिक करें तो एकमुश्त आइटम हेतु मैनुअल दर लिखें।',
        'चूँकि GST केवल सरकार की ओर से लिया जाता है और आपका पैसा नहीं है, हर मूल्य BASIC मान पर बताया जाता है। Live Estimate दिखाता है Subtotal (actuals) → Margin → Taxable Value (basic), फिर GST, फिर GST सहित Grand Total — और प्रति-वाट मूल्य दोनों तरह दिखता है: ₹/W basic (जिस पर आप वास्तव में कोट करते हैं) और ₹/W GST सहित। “Commercial Terms & Company” पैनल में तय करें कि ग्राहक कोटेशन पर क्या देखे: System Configuration (मॉड्यूल प्रकार जैसे “545 Wp Mono PERC”, पैनल प्रकार DCR / Non-DCR, इन्वर्टर प्रकार, माउंटिंग, कुल DC क्षमता, और Net Metering व Battery Backup शामिल हैं या नहीं — दोनों डिफ़ॉल्ट रूप से “Not included”, क्योंकि इनके अलग लाइसेंसिंग व शुल्क होते हैं), भुगतान अनुसूची, शर्तें, कार्य-क्षेत्र, अपवर्जन, और कोई अतिरिक्त तकनीकी आवश्यकताएँ / नोट्स।',
        'Documents बटन से ब्रांडेड PDF पैक डाउनलोड करें — प्रीमियम Proposal ब्रोशर, Commercial Quotation (मूल्य प्रस्ताव, दायरा, शर्तें, आपके बैंक विवरण व ग्राहक का स्वीकृति हस्ताक्षर) और घटक-स्तरीय Bill of Quantities — साथ या अलग, अंग्रेज़ी या हिंदी में। कोटेशन जीवंत दस्तावेज़ है: Save करें, Revise करें (हर संशोधन नया संस्करण), और सहमति पर Approve फिर Convert करके जीवंत परियोजना बनाएँ। गलती से Approve/Convert हो जाए तो Undo दबाएँ — यह छोटा कारण माँगता है (जैसे “client changed the scope”), कोटेशन को draft पर लौटाता है ताकि आप संपादित कर सकें, और बनाई गई परियोजना सुरक्षित रूप से हटा देता है (यदि उसमें वास्तविक गतिविधि हो तो रखता है)। हर चरण ऑडिट ट्रेल में दर्ज होता है।',
      ],
    },
  },
  {
    id: 'gst', icon: ShieldCheck,
    en: {
      title: 'GST Compliance — e-Invoice & e-Way Bill',
      body: [
        'Open “GST Compliance” to prepare e-Invoices and e-Way Bills — they are separate legal documents and sit side by side. Build an e-Invoice with the buyer, items and values; the software validates every field locally and flags problems before anything is submitted. An e-Way Bill carries the transport details (vehicle, transporter, distance) for moving goods.',
        'When you have your three GSTINs (Greater Noida, Bihar and Delhi) you switch between them from the branch selector at the top, and each office numbers its own documents. Because a live GST API is not provided to you, filing is done offline: the software builds the e-Invoice (or e-Way Bill) JSON, you click “Upload on GST Portal”, log in and bulk-upload the file, and the portal returns the IRN, Ack number and signed PDF. Open the document here, choose “Enter IRN” and upload that signed PDF — the IRN, Ack number and QR are read automatically and the finished, branded document is produced.',
      ],
    },
    hi: {
      title: 'GST अनुपालन — e-Invoice और e-Way Bill',
      body: [
        '“GST Compliance” खोलकर e-Invoice और e-Way Bill तैयार करें — ये अलग कानूनी दस्तावेज़ हैं और साथ-साथ रहते हैं। खरीदार, मदों व मूल्यों के साथ e-Invoice बनाएँ; सॉफ़्टवेयर हर फ़ील्ड को स्थानीय रूप से जाँचता है और जमा करने से पहले समस्याएँ बताता है। e-Way Bill माल की आवाजाही के परिवहन विवरण (वाहन, ट्रांसपोर्टर, दूरी) रखता है।',
        'जब आपके तीन GSTIN (ग्रेटर नोएडा, बिहार और दिल्ली) हों, तो आप ऊपर शाखा चयनकर्ता से उनके बीच बदलते हैं, और हर कार्यालय अपने दस्तावेज़ अलग से नंबर करता है। चूँकि आपको लाइव GST API नहीं दी गई है, फाइलिंग ऑफ़लाइन होती है: सॉफ़्टवेयर e-Invoice (या e-Way Bill) का JSON बनाता है, आप “Upload on GST Portal” पर क्लिक करते हैं, लॉगिन कर फ़ाइल बल्क-अपलोड करते हैं, और पोर्टल IRN, Ack संख्या व हस्ताक्षरित PDF लौटाता है। यहाँ दस्तावेज़ खोलें, “Enter IRN” चुनें और वह हस्ताक्षरित PDF अपलोड करें — IRN, Ack संख्या व QR अपने आप पढ़ लिए जाते हैं और तैयार, ब्रांडेड दस्तावेज़ बन जाता है।',
      ],
    },
  },
  {
    id: 'gst_flow', icon: ReceiptText,
    en: {
      title: 'e-Invoicing step by step (the offline filing loop)',
      body: [
        'Because the government does not give you a live software (API) connection, the whole e-invoicing cycle runs as an offline loop: you build the document here, hand a JSON file to the government portal, and bring the result back. Nothing is faked — the IRN you end up with is a real, government-issued number. There are five clear stages.',
        'Stage 1 — Build. Open “GST Compliance”, click New e-Invoice and fill the supply type (B2B for businesses, B2C for consumers, SEZ/Export where relevant), the document type, number and date, the seller (supplier) office, the buyer, and the line items with HSN/SAC, quantity, rate and GST percent. As you type, the software checks every field against the official GST schema and totals CGST+SGST (same state) or IGST (different state) live. Save it as a draft — you can reopen and edit a draft at any time.',
        'Stage 2 — Export the JSON. When the draft is ready, either open it and click “Portal JSON” to download just that one, or click “Bulk JSON” on the e-Invoice list to download every pending invoice as a single file (kept under 2 MB, which the portal accepts). This file is in the exact NIC format the portal expects.',
        'Stage 3 — Upload on the portal. Click “Upload on GST Portal”. A window opens with a one-click link to the portal, your saved login and the exact steps. Log in, go to E-Invoice → Bulk Upload (or Bulk IRN Generation), choose the JSON file and submit. The portal processes it and returns, for each invoice, an IRN (the 64-character Invoice Reference Number), an Acknowledgement number and date, and a digitally-signed PDF that carries the official QR code.',
        'Stage 4 — Bring the result back. Open the same invoice here, click “Enter IRN”, then “Scan signed PDF / QR image” and choose the signed PDF the portal gave you. The software reads the QR and the page text and fills in the IRN, the Acknowledgement number and date, and the signed QR — automatically, without you typing anything. (The QR alone does not contain the Ack number, which is why it also reads the PDF text.) Review and Save.',
        'Stage 5 — Print & use. The invoice is now finalised: it shows the green “Live” status with the real IRN and QR, and you can download its fully-branded PDF in English or Hindi. An e-Way Bill follows the same loop on the same portal — build it with the transport details, export the JSON, upload it, and record the EWB number that comes back.',
      ],
    },
    hi: {
      title: 'e-Invoicing चरण-दर-चरण (ऑफ़लाइन फाइलिंग चक्र)',
      body: [
        'चूँकि सरकार आपको लाइव सॉफ़्टवेयर (API) कनेक्शन नहीं देती, पूरा e-invoicing चक्र ऑफ़लाइन लूप में चलता है: आप दस्तावेज़ यहाँ बनाते हैं, एक JSON फ़ाइल सरकारी पोर्टल को देते हैं, और परिणाम वापस लाते हैं। कुछ भी नकली नहीं — जो IRN मिलता है वह असली, सरकार-जारी संख्या है। इसके पाँच स्पष्ट चरण हैं।',
        'चरण 1 — बनाएँ। “GST Compliance” खोलें, New e-Invoice पर क्लिक करें और भरें: सप्लाई प्रकार (व्यवसायों हेतु B2B, उपभोक्ताओं हेतु B2C, जहाँ लागू हो SEZ/Export), दस्तावेज़ का प्रकार, संख्या व दिनांक, विक्रेता (सप्लायर) कार्यालय, खरीदार, और मदें HSN/SAC, मात्रा, दर व GST% सहित। टाइप करते समय सॉफ़्टवेयर हर फ़ील्ड को आधिकारिक GST स्कीमा से जाँचता है और CGST+SGST (एक ही राज्य) या IGST (दूसरे राज्य) का कुल लाइव दिखाता है। इसे ड्राफ्ट के रूप में सहेजें — ड्राफ्ट को कभी भी दोबारा खोलकर बदला जा सकता है।',
        'चरण 2 — JSON निर्यात करें। ड्राफ्ट तैयार होने पर, या तो उसे खोलकर “Portal JSON” से केवल वही डाउनलोड करें, या e-Invoice सूची पर “Bulk JSON” से सभी लंबित इनवॉइस एक ही फ़ाइल में डाउनलोड करें (2 MB से कम, जिसे पोर्टल स्वीकार करता है)। यह फ़ाइल ठीक उसी NIC प्रारूप में होती है जो पोर्टल अपेक्षा करता है।',
        'चरण 3 — पोर्टल पर अपलोड करें। “Upload on GST Portal” पर क्लिक करें। एक विंडो खुलती है जिसमें पोर्टल का एक-क्लिक लिंक, आपका सहेजा लॉगिन और सटीक चरण होते हैं। लॉगिन करें, E-Invoice → Bulk Upload (या Bulk IRN Generation) पर जाएँ, JSON फ़ाइल चुनें और सबमिट करें। पोर्टल हर इनवॉइस के लिए लौटाता है — IRN (64-अक्षर का इनवॉइस संदर्भ संख्या), Acknowledgement संख्या व दिनांक, और एक डिजिटल-हस्ताक्षरित PDF जिसमें आधिकारिक QR कोड होता है।',
        'चरण 4 — परिणाम वापस लाएँ। वही इनवॉइस यहाँ खोलें, “Enter IRN” पर क्लिक करें, फिर “Scan signed PDF / QR image” चुनें और पोर्टल द्वारा दी गई हस्ताक्षरित PDF चुनें। सॉफ़्टवेयर QR और पृष्ठ-पाठ पढ़कर IRN, Acknowledgement संख्या व दिनांक, और हस्ताक्षरित QR — अपने आप भर देता है, बिना आपके कुछ टाइप किए। (केवल QR में Ack संख्या नहीं होती, इसीलिए यह PDF का पाठ भी पढ़ता है।) समीक्षा करें और सहेजें।',
        'चरण 5 — प्रिंट व उपयोग। अब इनवॉइस अंतिम है: यह असली IRN व QR के साथ हरा “Live” दिखाता है, और आप इसकी पूरी तरह ब्रांडेड PDF अंग्रेज़ी या हिंदी में डाउनलोड कर सकते हैं। e-Way Bill उसी पोर्टल पर इसी लूप का अनुसरण करता है — परिवहन विवरण के साथ बनाएँ, JSON निर्यात करें, अपलोड करें, और लौटी EWB संख्या दर्ज करें।',
      ],
    },
  },
  {
    id: 'gst_manage', icon: FileText,
    en: {
      title: 'Editing, cancelling, archiving & deleting e-Invoices',
      body: [
        'A draft (anything before an IRN) is fully editable — open it and click Edit to change anything, or click Delete to remove it. Deleted drafts are not gone forever: they move to the Recovery Center and can be restored. You can also filter the e-Invoice list by Active, Archived or All using the dropdown at the top of the list.',
        'Once an IRN is generated the document is locked: the crunch data — the parties, items, values and the IRN itself — can no longer be changed, because it is now a registered government record. The one thing you can still edit is the cosmetic letterhead/office address printed at the top of the PDF; change it and click “Update & download PDF” to reprint, without ever touching the registered data.',
        'To cancel a registered e-Invoice you cancel it on the government portal within the time the law allows, then record the cancellation here with “Cancel” and a reason; the document is marked Cancelled and a watermark appears on its PDF. Cancelled invoices are automatically excluded from the taxable-value and GST-value totals on the GST Dashboard, so your figures always reflect only valid bills.',
        'Archiving simply tidies the list — an archived document is hidden from the default “Active” view but is never deleted. Switch the filter to “Archived” to see them, open one and click “Unarchive” to bring it back. Use Archive for old or superseded documents you want out of the way but kept on record.',
      ],
    },
    hi: {
      title: 'e-Invoice का संपादन, रद्दीकरण, संग्रह व विलोपन',
      body: [
        'ड्राफ्ट (IRN से पहले कुछ भी) पूरी तरह संपादन-योग्य है — उसे खोलकर Edit से कुछ भी बदलें, या Delete से हटाएँ। हटाए गए ड्राफ्ट हमेशा के लिए नहीं जाते: वे Recovery Center में चले जाते हैं और पुनर्स्थापित किए जा सकते हैं। सूची के ऊपर ड्रॉपडाउन से e-Invoice सूची को Active, Archived या All से फ़िल्टर भी कर सकते हैं।',
        'IRN बनने के बाद दस्तावेज़ लॉक हो जाता है: मुख्य डेटा — पक्ष, मदें, मूल्य और स्वयं IRN — अब नहीं बदला जा सकता, क्योंकि यह अब पंजीकृत सरकारी रिकॉर्ड है। केवल एक चीज़ अब भी बदली जा सकती है — PDF के ऊपर छपने वाला कॉस्मेटिक लेटरहेड/कार्यालय पता; उसे बदलें और पंजीकृत डेटा को छुए बिना पुनः प्रिंट हेतु “Update & download PDF” पर क्लिक करें।',
        'पंजीकृत e-Invoice रद्द करने के लिए, कानून द्वारा अनुमत समय में उसे सरकारी पोर्टल पर रद्द करें, फिर यहाँ “Cancel” और एक कारण के साथ रद्दीकरण दर्ज करें; दस्तावेज़ Cancelled चिह्नित होता है और उसकी PDF पर वॉटरमार्क आता है। रद्द इनवॉइस GST डैशबोर्ड के कर-योग्य मूल्य और GST मूल्य कुल से स्वतः बाहर रहते हैं, इसलिए आपके आँकड़े हमेशा केवल वैध बिल दर्शाते हैं।',
        'संग्रह (Archive) केवल सूची साफ़ रखता है — संग्रहित दस्तावेज़ डिफ़ॉल्ट “Active” दृश्य से छिपा रहता है पर कभी हटता नहीं। उन्हें देखने हेतु फ़िल्टर को “Archived” करें, किसी को खोलकर “Unarchive” से वापस लाएँ। पुराने या प्रतिस्थापित दस्तावेज़ जिन्हें हटाना नहीं पर रास्ते से हटाना है, उनके लिए Archive उपयोग करें।',
      ],
    },
  },
  {
    id: 'gst_letterhead', icon: Building2,
    en: {
      title: 'Supplier, buyer & the letterhead address explained',
      body: [
        'An e-Invoice has three different addresses, and it helps to keep them straight. The “Seller / Supplier” block is where the supply is actually made from — its GSTIN decides whether the tax is CGST+SGST (same state) or IGST (different state). Use the “Pick supplier office” dropdown and it fills the GSTIN, legal name, address, location, pincode and state code from the office you choose.',
        'The “Letterhead / Office Address” at the very top is cosmetic only — it is what prints across the top of the PDF and is NOT part of the legal data sent to the portal. You can pick any of your offices for it, or type a different address, independently of the supplier. This is the one part you can change even after the IRN is locked.',
        'For the buyer, type the GSTIN and legal name; when you enter the 6-digit pincode the software fills the state code and place-of-supply automatically (for example 110070 fills 07 — Delhi), and you type the street address yourself. The same pincode helper works on the supplier side too.',
        'The PDF header shows your trade name, the chosen letterhead address, your CIN and email — the GSTIN and PAN are intentionally left out of the header because the GSTIN already appears in the supplier block just below. Your trade name is set to your full legal name (no short form), which is how the company is registered.',
      ],
    },
    hi: {
      title: 'सप्लायर, खरीदार और लेटरहेड पता — समझाया गया',
      body: [
        'एक e-Invoice में तीन अलग पते होते हैं, और इन्हें स्पष्ट रखना उपयोगी है। “Seller / Supplier” ब्लॉक वह है जहाँ से सप्लाई वास्तव में होती है — इसका GSTIN तय करता है कि कर CGST+SGST (एक ही राज्य) होगा या IGST (दूसरे राज्य)। “Pick supplier office” ड्रॉपडाउन उपयोग करें — यह चुने गए कार्यालय से GSTIN, कानूनी नाम, पता, स्थान, पिनकोड व राज्य कोड भर देता है।',
        'सबसे ऊपर “Letterhead / Office Address” केवल कॉस्मेटिक है — यह PDF के ऊपर छपता है और पोर्टल को भेजे जाने वाले कानूनी डेटा का हिस्सा नहीं है। आप इसके लिए अपना कोई भी कार्यालय चुन सकते हैं, या सप्लायर से अलग कोई पता टाइप कर सकते हैं। IRN लॉक होने के बाद भी यही एक भाग आप बदल सकते हैं।',
        'खरीदार के लिए GSTIN और कानूनी नाम टाइप करें; 6-अंकीय पिनकोड डालते ही सॉफ़्टवेयर राज्य कोड और सप्लाई-स्थान स्वतः भर देता है (उदा. 110070 → 07 — दिल्ली), और गली का पता आप स्वयं टाइप करते हैं। यही पिनकोड सहायक सप्लायर पक्ष पर भी काम करता है।',
        'PDF हेडर आपका ट्रेड नाम, चुना लेटरहेड पता, आपका CIN और ईमेल दिखाता है — GSTIN और PAN को हेडर से जानबूझकर हटाया गया है क्योंकि GSTIN पहले से ठीक नीचे सप्लायर ब्लॉक में है। आपका ट्रेड नाम आपके पूरे कानूनी नाम पर सेट है (कोई संक्षिप्त रूप नहीं), जैसा कंपनी पंजीकृत है।',
      ],
    },
  },
  {
    id: 'portal_login', icon: CloudUpload,
    en: {
      title: 'The GST portal login (set by the Editor)',
      body: [
        'The “Upload on GST Portal” window keeps your portal web address and login in one place for convenience, so you do not hunt for them every time. The link button opens the portal in a new browser tab. The address is einvoice2.gst.gov.in by default and can be changed.',
        'For security, the login is stored centrally and only the Editor can set or change it. Open the window and click Edit (you will only see Edit if you are the Editor), type the portal URL, the user ID and the password, and Save. It is shared across the computers that run this software, so it is set once and everyone benefits.',
        'Anyone signed in can see the user ID and open the portal, but the password stays hidden. To reveal it, click “Reveal (enter login password)” and type your own ARRAYS login password; once confirmed, the portal password is shown and can be copied. This means a saved password is never exposed just by opening the window — someone has to prove who they are first.',
      ],
    },
    hi: {
      title: 'GST पोर्टल लॉगिन (Editor द्वारा सेट)',
      body: [
        '“Upload on GST Portal” विंडो आपके पोर्टल वेब पते और लॉगिन को सुविधा हेतु एक जगह रखती है, ताकि हर बार ढूँढना न पड़े। लिंक बटन पोर्टल को नए ब्राउज़र टैब में खोलता है। पता डिफ़ॉल्ट रूप से einvoice2.gst.gov.in है और बदला जा सकता है।',
        'सुरक्षा हेतु, लॉगिन केंद्रीय रूप से संग्रहीत है और केवल Editor इसे सेट/बदल सकता है। विंडो खोलें और Edit पर क्लिक करें (Edit केवल तभी दिखेगा जब आप Editor हों), पोर्टल URL, यूज़र ID और पासवर्ड टाइप करें, और Save करें। यह उन सभी कंप्यूटरों में साझा होता है जो यह सॉफ़्टवेयर चलाते हैं, इसलिए एक बार सेट होता है और सबको लाभ मिलता है।',
        'कोई भी साइन-इन व्यक्ति यूज़र ID देख सकता है और पोर्टल खोल सकता है, पर पासवर्ड छिपा रहता है। उसे देखने हेतु “Reveal (enter login password)” पर क्लिक करें और अपना ARRAYS लॉगिन पासवर्ड टाइप करें; पुष्टि होते ही पोर्टल पासवर्ड दिखता है और कॉपी किया जा सकता है। यानी केवल विंडो खोलने भर से सहेजा पासवर्ड कभी उजागर नहीं होता — पहले पहचान सिद्ध करनी होती है।',
      ],
    },
  },
  {
    id: 'roles', icon: UserCog,
    en: {
      title: 'Roles & access — who can do what',
      body: [
        'The software has four roles. The System Manager (the day-to-day operator) does all the real work: payments, receipts, invoices, e-Invoices, e-Way Bills, delivery challans, quotations, vendors, clients, reports, backups and the Recovery Center. This is the account used for everyday operations.',
        'The configuration screens — Offices & GSTINs, Number Series, Branding, the Import Wizard, User Management and Data & Admin — are reserved for the Editor alone and are hidden from everyone else, so day-to-day use can never accidentally change the company’s setup, accounts or master data. The Editor is the super-admin and does everything, including setting the shared GST portal login and resetting other people’s passwords.',
        'The Admin is a strict VIEW-ONLY oversight account: it can open every data screen and read the books, but it cannot create, edit, delete, import, or export/download anything — useful for someone who should see the numbers without being able to change or take them out. The Auditor is a read-only reviewer for internal or statutory audit (it may still export for audit purposes). Whatever the role, every single action is recorded permanently in the audit trail with the time and the person’s name.',
      ],
    },
    hi: {
      title: 'भूमिकाएँ व पहुँच — कौन क्या कर सकता है',
      body: [
        'सॉफ़्टवेयर में चार भूमिकाएँ हैं। System Manager (रोज़ का संचालक) सारा वास्तविक काम करता है: भुगतान, प्राप्तियाँ, इनवॉइस, e-Invoice, e-Way Bill, डिलीवरी चालान, कोटेशन, विक्रेता, ग्राहक, रिपोर्ट, बैकअप और Recovery Center। यही खाता रोज़मर्रा के संचालन हेतु उपयोग होता है।',
        'कॉन्फ़िगरेशन स्क्रीन — Offices & GSTINs, Number Series, Branding, Import Wizard, User Management और Data & Admin — केवल Editor के लिए सुरक्षित हैं और बाकी सबसे छिपी हैं, ताकि रोज़ के उपयोग में कंपनी की सेटअप, खाते या मास्टर डेटा गलती से न बदले। Editor सुपर-एडमिन है और सब कुछ करता है — साझा GST पोर्टल लॉगिन सेट करना और दूसरों के पासवर्ड रीसेट करना भी।',
        'Admin एक सख़्त केवल-दृश्य (VIEW-ONLY) निगरानी खाता है: यह हर डेटा स्क्रीन खोलकर बही पढ़ सकता है, पर कुछ भी बना/बदल/हटा/आयात/निर्यात-डाउनलोड नहीं कर सकता — उस व्यक्ति के लिए उपयोगी जिसे आँकड़े देखने हों पर बदल या बाहर न ले जा सके। Auditor आंतरिक/वैधानिक ऑडिट हेतु केवल-पठन समीक्षक है (ऑडिट हेतु निर्यात कर सकता है)। भूमिका चाहे जो हो, हर क्रिया समय व व्यक्ति के नाम सहित स्थायी रूप से ऑडिट ट्रेल में दर्ज होती है।',
      ],
    },
  },
  {
    id: 'passwords', icon: ShieldCheck,
    en: {
      title: 'Passwords — change your own, reset others',
      body: [
        'To change your own password, click your name at the top-right and choose “Change Password”. Enter your current password, then the new one twice. This works for every role.',
        'The Editor can reset anybody’s password from User Management: open the page, find the person and click “Reset password”, then type a new password for them. They can sign in with it and change it themselves afterwards. (User Management is editor-only — the view-only Admin cannot reach it.)',
        'Keep your passwords private and change them from time to time. Because a few sensitive actions — such as cancelling a document, restoring a backup, or revealing the saved GST-portal password — ask you to confirm your password, having a current, memorable password keeps those steps smooth.',
      ],
    },
    hi: {
      title: 'पासवर्ड — अपना बदलें, दूसरों का रीसेट करें',
      body: [
        'अपना पासवर्ड बदलने हेतु ऊपर-दाईं ओर अपने नाम पर क्लिक करें और “Change Password” चुनें। अपना वर्तमान पासवर्ड डालें, फिर नया पासवर्ड दो बार। यह हर भूमिका के लिए काम करता है।',
        'Editor किसी का भी पासवर्ड User Management से रीसेट कर सकता है: पृष्ठ खोलें, व्यक्ति ढूँढें और “Reset password” पर क्लिक करें, फिर उनके लिए नया पासवर्ड टाइप करें। वे उससे साइन-इन कर बाद में स्वयं बदल सकते हैं। (User Management केवल-Editor है — केवल-दृश्य Admin इस तक नहीं पहुँच सकता।)',
        'अपने पासवर्ड निजी रखें और समय-समय पर बदलें। चूँकि कुछ संवेदनशील कार्य — जैसे दस्तावेज़ रद्द करना, बैकअप पुनर्स्थापित करना, या सहेजा GST-पोर्टल पासवर्ड देखना — आपका पासवर्ड पुष्टि माँगते हैं, एक वर्तमान, याद रहने वाला पासवर्ड इन चरणों को सहज रखता है।',
      ],
    },
  },
  {
    id: 'reports', icon: BarChart3,
    en: {
      title: 'Reports, exports & download language',
      body: [
        'Open “Reports” for management-ready summaries, and use the Excel or PDF buttons on the Payments, Receipts, ledger and challan screens to export exactly what is on the screen, filtered by the date range you chose. Vendor, client and employee ledgers each export from their own page.',
        'Every document and report download — invoices, e-way bills, quotations, delivery challans and reports — can be produced in English or Hindi. When you click a PDF or Excel button a small pop-up asks which language you want; the headings, labels and totals translate while names, GSTINs, dates and amounts stay as they are, which is the normal format for Indian bilingual documents.',
        'The Reports area gathers the management views — outgoing payments, incoming receipts, invoices, project profitability and the vendor / client / employee ledgers — each filterable by date, project, client or vendor before you export. Pick the window you need (this month, this quarter or a custom range), check the totals on screen, then download. One role note: the view-only Admin account can read these figures but cannot export them; the System Manager and Editor can.',
      ],
    },
    hi: {
      title: 'रिपोर्ट, निर्यात और डाउनलोड भाषा',
      body: [
        '“Reports” खोलकर प्रबंधन-तैयार सारांश पाएँ, और Payments, Receipts, बही व चालान स्क्रीन पर Excel/PDF बटन से वही निकालें जो स्क्रीन पर है, आपके चुने दिनांक-दायरे से फ़िल्टर होकर। विक्रेता, ग्राहक और कर्मचारी बही अपने-अपने पृष्ठ से निर्यात होती हैं।',
        'हर दस्तावेज़ और रिपोर्ट डाउनलोड — इनवॉइस, e-way bill, कोटेशन, चालान और रिपोर्ट — अंग्रेज़ी या हिंदी में बनाई जा सकती है। PDF या Excel बटन दबाते ही एक छोटा पॉपअप भाषा पूछता है; शीर्षक, लेबल और कुल अनुवादित होते हैं जबकि नाम, GSTIN, दिनांक व राशि वैसे ही रहते हैं — भारतीय द्विभाषी दस्तावेज़ों का सामान्य प्रारूप।',
      ],
    },
  },
  {
    id: 'backup', icon: DatabaseBackup,
    en: {
      title: 'Backup & Publish to Cloud — one click',
      body: [
        'Both are always one click away. Click your name at the top-right and you will see “Create Backup” and “Publish to Cloud” right there. Create Backup saves the entire software — every record and every uploaded file — into one timestamped file on this computer; the software also does this automatically every two hours, so you are protected even if you forget. Publish to Cloud uploads a copy of your data so the admin can view and export it on the web; your heavy files (proofs, statements) stay on this computer.',
        'For the full picture, open “Backup & Restore” (also in the menu and the left sidebar). There you can run a backup, verify it, run a safe disaster-recovery test that never touches live data, download a backup to keep off-site, and set how many backups to keep. When you sign out, the software offers to take a fresh backup first so a day’s work is never left unprotected.',
        'Restoring is just as simple and is safe by design: you can preview exactly what a backup contains before applying it, and a restore only adds back missing records — it never wipes what is already there. As a habit, copy a recent backup file onto a pen-drive or a second computer too, so even a hard-disk failure cannot lose your books. The retention setting controls how many timestamped backups are kept on this machine before the oldest is rotated out.',
      ],
    },
    hi: {
      title: 'बैकअप और क्लाउड पर प्रकाशन — एक क्लिक',
      body: [
        'दोनों हमेशा एक क्लिक दूर हैं। ऊपर-दाईं ओर अपने नाम पर क्लिक करें — वहीं “Create Backup” और “Publish to Cloud” दिखेंगे। Create Backup पूरे सॉफ़्टवेयर को — हर रिकॉर्ड और हर अपलोड फ़ाइल — इसी कंप्यूटर पर एक समयांकित फ़ाइल में सहेजता है; सॉफ़्टवेयर यह हर दो घंटे में स्वतः भी करता है, इसलिए भूलने पर भी आप सुरक्षित हैं। Publish to Cloud आपके डेटा की एक प्रति अपलोड करता है ताकि एडमिन वेब पर देख व निर्यात कर सके; आपकी भारी फ़ाइलें (प्रूफ़, स्टेटमेंट) इसी कंप्यूटर पर रहती हैं।',
        'पूरी जानकारी के लिए “Backup & Restore” खोलें (मेनू और बाएँ साइडबार में भी)। वहाँ आप बैकअप ले सकते हैं, सत्यापित कर सकते हैं, एक सुरक्षित आपदा-पुनर्प्राप्ति परीक्षण चला सकते हैं जो लाइव डेटा को नहीं छूता, बैकअप डाउनलोड कर ऑफ-साइट रख सकते हैं, और कितने बैकअप रखने हैं तय कर सकते हैं। साइन आउट करते समय, सॉफ़्टवेयर पहले एक ताज़ा बैकअप लेने का सुझाव देता है ताकि दिन का काम कभी असुरक्षित न रहे।',
        'पुनर्स्थापना भी उतनी ही सरल और सुरक्षित है: लागू करने से पहले आप ठीक देख सकते हैं कि बैकअप में क्या है, और पुनर्स्थापना केवल गायब रिकॉर्ड वापस जोड़ती है — मौजूदा कुछ मिटाती नहीं। आदत के रूप में, हाल का बैकअप पेन-ड्राइव या दूसरे कंप्यूटर पर भी कॉपी रखें, ताकि हार्ड-डिस्क खराब होने पर भी बही न खोए। रिटेंशन सेटिंग तय करती है कि सबसे पुराना हटने से पहले इस मशीन पर कितने समयांकित बैकअप रखे जाएँ।',
      ],
    },
  },
  {
    id: 'recovery', icon: LifeBuoy,
    en: {
      title: 'Recovery Center — undo mistakes',
      body: [
        'Open the “Recovery Center” whenever something goes wrong. Anything you deleted — an invoice, an e-way bill or a delivery challan — is listed here and can be brought back with a single Recover click; nothing is ever truly lost. The same screen shows your recovery points (backups), where you can verify a backup’s integrity or download it, and links to the full audit trail of every change.',
        'Restoring from a backup is additive and safe: it brings back missing records without overwriting what you already have, so you can recover from a problem without fear of wiping today’s work.',
        'The two layers work together: use Recover for the everyday “I deleted the wrong thing” mistake — instant and for a single record — and a backup restore for the bigger “I need last week’s state back” situation. Either way the audit trail records what was removed and what was brought back, so there is always a clear account; nothing disappears silently and nothing is overwritten by accident.',
      ],
    },
    hi: {
      title: 'रिकवरी सेंटर — गलतियाँ पूर्ववत करें',
      body: [
        'कुछ गलत होने पर “Recovery Center” खोलें। आपने जो हटाया — इनवॉइस, e-way bill या डिलीवरी चालान — वह यहाँ सूचीबद्ध होता है और एक Recover क्लिक से वापस आ जाता है; कुछ भी सचमुच नहीं खोता। वही स्क्रीन आपके रिकवरी पॉइंट (बैकअप) दिखाती है, जहाँ आप बैकअप की अखंडता जाँच या डाउनलोड कर सकते हैं, और हर बदलाव के पूरे ऑडिट ट्रेल के लिंक देती है।',
        'बैकअप से पुनर्स्थापना योगात्मक और सुरक्षित है: यह गायब रिकॉर्ड वापस लाती है पर मौजूदा डेटा को अधिलेखित नहीं करती, इसलिए आप आज का काम मिटने के डर के बिना किसी समस्या से उबर सकते हैं।',
        'दोनों परतें साथ काम करती हैं: रोज़ की “गलत चीज़ हट गई” भूल हेतु Recover उपयोग करें — तुरंत और एकल रिकॉर्ड के लिए — और बड़ी “पिछले सप्ताह की स्थिति चाहिए” स्थिति हेतु बैकअप पुनर्स्थापना। किसी भी तरह, ऑडिट ट्रेल दर्ज करता है कि क्या हटा और क्या वापस आया, इसलिए हमेशा स्पष्ट विवरण रहता है; कुछ चुपचाप गायब नहीं होता और गलती से अधिलेखित नहीं होता।',
      ],
    },
  },
  {
    id: 'protection', icon: Save,
    en: {
      title: 'Never lose your work',
      body: [
        'The software quietly protects whatever you are typing. While you fill an invoice or a challan, your work is auto-saved as a draft on this computer, so if the browser closes, the power goes off or the screen is shut by accident, you will be offered to restore that draft the next time you open the form. If you try to leave a form with unsaved changes, the software warns you first rather than letting the work vanish.',
        'Together with the automatic two-hourly backups and the offer to back up before you sign out, this means a normal mishap — a crash, a power cut, a closed tab — does not cost you your data.',
        'None of this needs any action from you; it runs on its own. If you ever see a “restore your draft?” prompt when reopening a form, it simply means the app kept what you were typing through an interruption — accept it to carry on where you left off, or dismiss it to start fresh.',
      ],
    },
    hi: {
      title: 'अपना काम कभी न खोएँ',
      body: [
        'सॉफ़्टवेयर चुपचाप आपकी टाइपिंग की रक्षा करता है। इनवॉइस या चालान भरते समय आपका काम इसी कंप्यूटर पर ड्राफ्ट के रूप में स्वतः सहेजा जाता है, इसलिए यदि ब्राउज़र बंद हो जाए, बिजली चली जाए या स्क्रीन गलती से बंद हो जाए, तो अगली बार फ़ॉर्म खोलने पर आपको वह ड्राफ्ट पुनर्स्थापित करने का विकल्प मिलेगा। बिना सहेजे फ़ॉर्म छोड़ने पर सॉफ़्टवेयर पहले चेतावनी देता है, ताकि काम गायब न हो।',
        'हर दो घंटे के स्वतः बैकअप और साइन आउट से पहले बैकअप के सुझाव के साथ, इसका अर्थ है कि सामान्य दुर्घटना — क्रैश, बिजली कटौती, बंद टैब — आपका डेटा नहीं छीनती।',
        'इसके लिए आपको कुछ नहीं करना पड़ता; यह अपने-आप चलता है। यदि फ़ॉर्म दोबारा खोलते समय कभी “restore your draft?” संकेत दिखे, तो इसका अर्थ है कि ऐप ने किसी रुकावट के दौरान आपकी टाइपिंग सहेज रखी थी — जहाँ छोड़ा था वहीं जारी रखने हेतु स्वीकारें, या नए सिरे से शुरू करने हेतु खारिज करें।',
      ],
    },
  },
  {
    id: 'security', icon: ShieldCheck,
    en: {
      title: 'Security verification for sensitive actions',
      body: [
        'A few sensitive actions — such as cancelling a registered document or restoring from a backup — ask for an extra step: you confirm your password and a short verification code before they go through. This protects against accidental or unauthorised changes. Complete the two steps when prompted and the action proceeds.',
        'Because the software runs locally and is not wired to an email server, the verification code is shown to you right on the screen rather than emailed — you simply read it and type it back. The same idea protects the saved GST-portal password: it is only revealed after you re-enter your own login password, so just opening a window never exposes a secret.',
        'Whatever the action, it is recorded in the audit trail with the time and your name, so there is always a clear account of who did what — see the Activity & Audit topic for the full picture.',
      ],
    },
    hi: {
      title: 'संवेदनशील कार्यों हेतु सुरक्षा सत्यापन',
      body: [
        'कुछ संवेदनशील कार्य — जैसे पंजीकृत दस्तावेज़ रद्द करना या बैकअप से पुनर्स्थापना — एक अतिरिक्त चरण माँगते हैं: आगे बढ़ने से पहले आप अपना पासवर्ड और एक छोटा सत्यापन कोड पुष्टि करते हैं। यह आकस्मिक या अनधिकृत बदलाव से बचाता है। संकेत मिलने पर दोनों चरण पूरे करें और कार्य आगे बढ़ता है।',
        'चूँकि सॉफ़्टवेयर स्थानीय रूप से चलता है और किसी ईमेल सर्वर से जुड़ा नहीं है, सत्यापन कोड आपको स्क्रीन पर ही दिखाया जाता है (ईमेल नहीं किया जाता) — आप उसे पढ़कर वापस टाइप कर देते हैं। यही विचार सहेजे GST-पोर्टल पासवर्ड की रक्षा करता है: वह तभी दिखता है जब आप अपना लॉगिन पासवर्ड फिर डालते हैं, इसलिए केवल विंडो खोलने भर से कोई रहस्य उजागर नहीं होता।',
        'कार्य चाहे जो हो, वह समय और आपके नाम सहित ऑडिट ट्रेल में दर्ज होता है, ताकि हमेशा स्पष्ट रहे कि किसने क्या किया — पूरी जानकारी हेतु “Activity & Audit” विषय देखें।',
      ],
    },
  },
  {
    id: 'language', icon: Languages,
    en: {
      title: 'Changing the language',
      body: [
        'Click the language button (EN / हिं) at the top-right of any screen and the entire app instantly switches between English and Hindi — menus, buttons, labels and tables. Your choice is remembered the next time you open the software, so language is never a barrier.',
        'The translation is applied to the interface text only; your actual data — names, GSTINs, document numbers, dates and amounts — always stays exactly as you typed it, because that is the official record. A few technical tags (like a GSTIN field or a branch code) are deliberately left untranslated so they never get garbled.',
        'Separately from the screen language, each document you download can be produced in English or Hindi, chosen from a small pop-up at download time. The Hindi PDFs use a proper Devanagari font so the text renders cleanly, which is the normal format for Indian bilingual paperwork.',
      ],
    },
    hi: {
      title: 'भाषा बदलना',
      body: [
        'किसी भी स्क्रीन के ऊपर-दाईं ओर भाषा बटन (EN / हिं) पर क्लिक करें और पूरा ऐप तुरंत अंग्रेज़ी–हिंदी में बदल जाता है — मेनू, बटन, लेबल और तालिकाएँ। अगली बार सॉफ़्टवेयर खोलने पर आपकी पसंद याद रहती है, इसलिए भाषा कभी बाधा नहीं बनती।',
        'अनुवाद केवल इंटरफ़ेस पाठ पर लागू होता है; आपका वास्तविक डेटा — नाम, GSTIN, दस्तावेज़ संख्या, दिनांक व राशि — हमेशा वैसा ही रहता है जैसा आपने टाइप किया, क्योंकि वही आधिकारिक रिकॉर्ड है। कुछ तकनीकी टैग (जैसे GSTIN फ़ील्ड या शाखा कोड) जानबूझकर अनूदित नहीं किए जाते ताकि वे कभी गड़बड़ न हों।',
        'स्क्रीन भाषा से अलग, हर डाउनलोड दस्तावेज़ अंग्रेज़ी या हिंदी में बनाया जा सकता है, जो डाउनलोड के समय एक छोटे पॉपअप से चुना जाता है। हिंदी PDF उचित देवनागरी फ़ॉन्ट उपयोग करती हैं ताकि पाठ साफ़ दिखे — भारतीय द्विभाषी कागज़ात का सामान्य प्रारूप।',
      ],
    },
  },
  {
    id: 'troubleshooting', icon: Search,
    en: {
      title: 'Fixing common problems',
      body: [
        'If the app will not open or shows a blank page, make sure the engine is running — use the “Start ARRAYS ERP” shortcut or open the local web address; if it is still stuck, restart the computer, as the database starts automatically. If a file upload fails, the file type or size may be unsupported, so use a PDF, image or Excel/CSV within the size limit and try again — the error text names the cause.',
        'If an invoice will not submit, run Validate first and fix each red error (common ones are an invalid GSTIN, a missing item or value, or an HSN that needs more digits). A “duplicate document number” message means that number already exists for that office — use a different number, or confirm the override with a reason. If something looks wrong, the Recovery Center lets you bring back deleted records, and the audit trail shows exactly what changed and when.',
        'A few role-related messages are normal, not faults: if a screen says you cannot do something or an export/import is blocked, you are likely on the view-only Admin account — sign in as the System Manager or Editor for that action. If the government portal rejects the uploaded JSON, read its on-screen reason (often a wrong state code, a blank Location, or a B2C invoice which the IRP does not accept), fix that field here, download the JSON again and re-upload. When in doubt, check the System Status / diagnostics screen (Editor) for a quick health read, and remember every action is in the audit trail if you need to retrace a step.',
      ],
    },
    hi: {
      title: 'सामान्य समस्याएँ ठीक करना',
      body: [
        'यदि ऐप न खुले या खाली पृष्ठ दिखे, तो सुनिश्चित करें कि इंजन चल रहा है — “Start ARRAYS ERP” शॉर्टकट उपयोग करें या स्थानीय वेब पता खोलें; फिर भी अटके तो कंप्यूटर पुनः चालू करें, क्योंकि डेटाबेस स्वतः शुरू होता है। यदि फ़ाइल अपलोड विफल हो, तो फ़ाइल प्रकार/आकार असमर्थित हो सकता है, इसलिए सीमा के भीतर PDF, छवि या Excel/CSV उपयोग करें — त्रुटि पाठ कारण बताता है।',
        'यदि इनवॉइस जमा न हो, पहले Validate करें और हर लाल त्रुटि ठीक करें (आम: अमान्य GSTIN, गायब मद/मूल्य, या HSN जिसमें अधिक अंक चाहिए)। “duplicate document number” संदेश का अर्थ है वह संख्या इस कार्यालय में पहले से है — अलग संख्या उपयोग करें या कारण सहित ओवरराइड पुष्टि करें। कुछ गलत लगे तो Recovery Center से हटाए रिकॉर्ड वापस लाएँ, और ऑडिट ट्रेल दिखाता है कि क्या और कब बदला।',
        'कुछ भूमिका-संबंधी संदेश सामान्य हैं, खराबी नहीं: यदि कोई स्क्रीन कहे कि आप यह नहीं कर सकते या निर्यात/आयात अवरुद्ध है, तो संभवतः आप केवल-दृश्य Admin खाते पर हैं — उस क्रिया हेतु System Manager या Editor से साइन-इन करें। यदि सरकारी पोर्टल अपलोड किया JSON अस्वीकार करे, तो उसका स्क्रीन-कारण पढ़ें (अक्सर गलत राज्य कोड, खाली Location, या B2C इनवॉइस जिसे IRP स्वीकार नहीं करता), यहाँ वह फ़ील्ड ठीक करें, JSON फिर डाउनलोड कर पुनः अपलोड करें। संदेह हो तो System Status / diagnostics स्क्रीन (Editor) पर त्वरित स्वास्थ्य जाँच देखें, और याद रखें हर क्रिया ऑडिट ट्रेल में है यदि कदम दोबारा देखना हो।',
      ],
    },
  },
  {
    id: 'search', icon: Search,
    en: {
      title: 'Finding anything fast — search & saved views',
      body: [
        'The search box at the top of every screen is a universal finder: type an invoice number, an IRN, an e-way-bill number, a GSTIN, or a customer or vendor name, and it jumps you straight to the matching record wherever it lives. It is the quickest way to pull up a document when someone calls to ask about it.',
        'Inside the big lists (e-Invoices, payments, vendors and so on) there is a second search-and-filter bar that narrows the list itself — by text, status, date range or archived state. These are ideal for month-end work where you want, say, all draft e-invoices for one office, or every payment to one vendor in a quarter.',
        'On the GST screens you can save a filter you use often as a named “Saved View”, then re-apply it in one click next time instead of setting the filters again. Small habit, big time-saver when the same review repeats every month.',
      ],
    },
    hi: {
      title: 'कुछ भी तेज़ी से ढूँढें — खोज व सहेजे दृश्य',
      body: [
        'हर स्क्रीन के ऊपर खोज बॉक्स एक सार्वभौमिक फाइंडर है: इनवॉइस संख्या, IRN, e-way-bill संख्या, GSTIN, या ग्राहक/विक्रेता नाम टाइप करें — यह आपको सीधे मिलते रिकॉर्ड पर ले जाता है, चाहे वह कहीं भी हो। जब कोई फ़ोन कर किसी दस्तावेज़ के बारे में पूछे, तो यह सबसे तेज़ तरीका है।',
        'बड़ी सूचियों (e-Invoice, भुगतान, विक्रेता आदि) में एक दूसरी खोज-व-फ़िल्टर पट्टी होती है जो सूची को ही सीमित करती है — पाठ, स्थिति, दिनांक-दायरा या संग्रह-स्थिति से। महीने के अंत के काम हेतु आदर्श, जैसे एक कार्यालय के सभी ड्राफ्ट e-invoice, या किसी तिमाही में एक विक्रेता को सभी भुगतान।',
        'GST स्क्रीन पर अक्सर उपयोग होने वाले फ़िल्टर को नामित “Saved View” के रूप में सहेजें, फिर अगली बार एक क्लिक में पुनः लागू करें। छोटी आदत, पर हर महीने वही समीक्षा दोहराते समय बड़ी समय-बचत।',
      ],
    },
  },
  {
    id: 'projects', icon: FolderKanban,
    en: {
      title: 'Projects & Sites — job costing',
      body: [
        'Projects and Sites let you group all the money and documents for one job in one place. Create a project (for example a rooftop plant for a particular client) and, under it, the individual sites where work happens. Every payment, receipt or invoice can then be tagged to a project and a site.',
        'Because each transaction carries its project tag, the software shows each project’s spend, billing and profitability without any manual adding-up. Open a project to see its full activity, and use the project filters in Reports to compare one job against another.',
        'Tagging the project and site on every entry is the single most useful habit for accurate job costing — it takes a moment when you record a payment and saves hours of untangling later.',
      ],
    },
    hi: {
      title: 'परियोजनाएँ व साइटें — जॉब कॉस्टिंग',
      body: [
        'परियोजनाएँ और साइटें एक काम के सारे पैसे व दस्तावेज़ एक जगह समूहित करने देती हैं। एक परियोजना बनाएँ (उदा. किसी ग्राहक हेतु रूफ़टॉप प्लांट) और उसके अंतर्गत वे साइटें जहाँ काम होता है। फिर हर भुगतान, प्राप्ति या इनवॉइस को परियोजना व साइट से टैग किया जा सकता है।',
        'चूँकि हर लेनदेन अपना परियोजना-टैग रखता है, सॉफ़्टवेयर बिना किसी मैनुअल जोड़ के हर परियोजना का खर्च, बिलिंग और लाभप्रदता दिखाता है। परियोजना खोलकर उसकी पूरी गतिविधि देखें, और एक काम की दूसरे से तुलना हेतु Reports में परियोजना फ़िल्टर उपयोग करें।',
        'हर प्रविष्टि पर परियोजना व साइट टैग करना सटीक जॉब-कॉस्टिंग की सबसे उपयोगी आदत है — भुगतान दर्ज करते समय एक पल लगता है और बाद में घंटों की उलझन बचाता है।',
      ],
    },
  },
  {
    id: 'employees', icon: UserRound,
    en: {
      title: 'Employees ledger',
      body: [
        'The Employees module is a simple ledger for staff-related money — salaries, advances, reimbursements and the like. Add each employee once, then record payments to them just as you record vendor payments, choosing “employee” as the payee.',
        'Open any employee to see their running ledger — everything paid, with dates and a balance — exportable to Excel or PDF. Keeping staff payments separate from vendor purchases keeps your books clean and easy to explain to anyone reviewing them.',
      ],
    },
    hi: {
      title: 'कर्मचारी बही',
      body: [
        'कर्मचारी मॉड्यूल स्टाफ़-संबंधी धन — वेतन, अग्रिम, प्रतिपूर्ति आदि — हेतु एक सरल बही है। हर कर्मचारी को एक बार जोड़ें, फिर उन्हें भुगतान वैसे ही दर्ज करें जैसे विक्रेता भुगतान, payee में “employee” चुनकर।',
        'किसी भी कर्मचारी को खोलकर उसकी चालू बही देखें — सब भुगतान, दिनांक व शेष सहित — Excel या PDF में निर्यात-योग्य। स्टाफ़ भुगतान को विक्रेता खरीद से अलग रखने से आपकी बही साफ़ और समझाने में आसान रहती है।',
      ],
    },
  },
  {
    id: 'documents', icon: FileText,
    en: {
      title: 'Document vault & attachments',
      body: [
        'Almost every record can carry attachments — a vendor bill on a payment, a proof on a receipt, the bank statement on a reconciliation, supporting papers on an invoice or challan. Use the attach control on the record, choose the file (PDF, image or spreadsheet), and it is stored safely on this computer with a checksum and a version number.',
        'Storing the proof with the transaction means an auditor or a colleague can open one record and see both the entry and its evidence, without hunting through folders. These files stay on this computer (they are not pushed to the cloud), so even large scans never slow the software down.',
      ],
    },
    hi: {
      title: 'दस्तावेज़ वॉल्ट व संलग्नक',
      body: [
        'लगभग हर रिकॉर्ड संलग्नक रख सकता है — भुगतान पर विक्रेता बिल, प्राप्ति पर प्रूफ़, समाधान पर बैंक स्टेटमेंट, इनवॉइस या चालान पर सहायक कागज़। रिकॉर्ड पर attach नियंत्रण उपयोग करें, फ़ाइल चुनें (PDF, छवि या स्प्रेडशीट), और वह इसी कंप्यूटर पर checksum व संस्करण संख्या सहित सुरक्षित रखी जाती है।',
        'प्रूफ़ को लेनदेन के साथ रखने का अर्थ है कि ऑडिटर या सहकर्मी एक रिकॉर्ड खोलकर प्रविष्टि और उसका प्रमाण दोनों देख सकता है, बिना फ़ोल्डर ढूँढे। ये फ़ाइलें इसी कंप्यूटर पर रहती हैं (क्लाउड पर नहीं भेजी जातीं), इसलिए बड़े स्कैन भी सॉफ़्टवेयर को धीमा नहीं करते।',
      ],
    },
  },
  {
    id: 'gst_dashboard', icon: FileCheck2,
    en: {
      title: 'The GST Dashboard',
      body: [
        'The GST Dashboard is your compliance control-room. The top tiles count e-invoices by stage — total, draft, pending, IRN-generated, cancelled and failed validation — and show the taxable value and GST value across all valid bills (cancelled invoices are deliberately excluded so the totals can be trusted).',
        'Below that are e-way-bill counts (active, expiring soon, expired, cancelled), charts of monthly value and the state-wise spread of your sales, and strips that surface any open alerts or reconciliation differences. Click any tile to jump straight into the matching list. The green “Live” badge confirms you are working with real data, filed offline through the portal.',
      ],
    },
    hi: {
      title: 'GST डैशबोर्ड',
      body: [
        'GST डैशबोर्ड आपका अनुपालन कंट्रोल-रूम है। ऊपर की टाइलें e-invoice को चरण अनुसार गिनती हैं — कुल, ड्राफ्ट, लंबित, IRN-जनित, रद्द और विफल सत्यापन — और सभी वैध बिलों का कर-योग्य मूल्य व GST मूल्य दिखाती हैं (रद्द इनवॉइस जानबूझकर बाहर ताकि कुल भरोसेमंद रहें)।',
        'उसके नीचे e-way-bill गिनती (सक्रिय, जल्द समाप्त, समाप्त, रद्द), मासिक मूल्य व राज्य-वार बिक्री-फैलाव के चार्ट, और किसी खुले अलर्ट या समाधान-अंतर को सामने लाने वाली पट्टियाँ होती हैं। किसी भी टाइल पर क्लिक कर सीधे मिलती सूची में जाएँ। हरा “Live” बैज पुष्टि करता है कि आप असली डेटा के साथ काम कर रहे हैं, जो पोर्टल से ऑफ़लाइन फाइल होता है।',
      ],
    },
  },
  {
    id: 'gst_recon', icon: GitCompareArrows,
    en: {
      title: 'GST Reconciliation',
      body: [
        'GST Reconciliation checks your own records for consistency before you rely on them — that every invoice with an IRN has matching values, that nothing is left half-finished, and that totals line up. It lists any differences it finds as items you can open and fix one by one.',
        'Think of it as a pre-filing health check: clearing the reconciliation list means your e-invoices and e-way bills are internally consistent and ready, so month-end — and any later comparison against the government’s records — goes smoothly with no surprises.',
      ],
    },
    hi: {
      title: 'GST समाधान',
      body: [
        'GST समाधान आपके अपने रिकॉर्ड की संगति जाँचता है — कि IRN वाले हर इनवॉइस के मूल्य मेल खाते हों, कुछ अधूरा न छूटे, और कुल मिलें। जो भी अंतर मिलते हैं उन्हें वस्तुओं के रूप में सूचीबद्ध करता है जिन्हें आप एक-एक खोलकर ठीक कर सकते हैं।',
        'इसे फाइलिंग-पूर्व स्वास्थ्य जाँच समझें: समाधान सूची साफ़ होने का अर्थ है आपके e-invoice और e-way bill आंतरिक रूप से संगत व तैयार हैं, ताकि महीने का अंत — और बाद में सरकारी रिकॉर्ड से कोई तुलना — बिना किसी आश्चर्य के सहज रहे।',
      ],
    },
  },
  {
    id: 'activity', icon: Activity,
    en: {
      title: 'Activity & Audit trail',
      body: [
        'Every action in the software — create, edit, submit, cancel, archive, delete, restore and sign-in — is written permanently to the audit trail, recording who did it, what changed and the exact time. Open “Activity & Audit” to see this timeline for the whole system, or open any single record to see just its own history.',
        'Nothing can be quietly altered: even deletions are recorded (and are recoverable). This gives you a complete, tamper-evident account of how every figure came to be — invaluable for trust, for handing over to someone else, and for any internal or statutory audit.',
      ],
    },
    hi: {
      title: 'गतिविधि व ऑडिट ट्रेल',
      body: [
        'सॉफ़्टवेयर की हर क्रिया — बनाना, बदलना, जमा करना, रद्द करना, संग्रह, विलोपन, पुनर्स्थापना और साइन-इन — स्थायी रूप से ऑडिट ट्रेल में दर्ज होती है, जिसमें किसने किया, क्या बदला और सटीक समय रहता है। पूरे सिस्टम की यह समयरेखा देखने हेतु “Activity & Audit” खोलें, या किसी एक रिकॉर्ड को खोलकर केवल उसका इतिहास देखें।',
        'कुछ भी चुपचाप नहीं बदला जा सकता: विलोपन भी दर्ज होते हैं (और पुनर्प्राप्त किए जा सकते हैं)। यह आपको पूर्ण, छेड़छाड़-स्पष्ट विवरण देता है कि हर आँकड़ा कैसे बना — भरोसे, किसी और को सौंपने, और किसी आंतरिक या वैधानिक ऑडिट हेतु अमूल्य।',
      ],
    },
  },
  {
    id: 'glossary', icon: BookOpen,
    en: {
      title: 'Glossary of GST & accounting terms',
      body: [
        'IRN (Invoice Reference Number) — the unique 64-character number the government issues when an e-invoice is registered; it is what makes the invoice legally valid. Ack No (Acknowledgement Number) — the receipt number the portal returns alongside the IRN, printed on the signed copy. Signed QR — the official QR code on a registered invoice that anyone can scan to verify it.',
        'HSN / SAC — the GST classification code for goods (HSN) or services (SAC), which sets the tax treatment. CGST + SGST versus IGST — tax on a sale within your own state splits into Central and State GST, while a sale to another state uses a single Integrated GST instead. Place of Supply — the state where a supply is treated as made, which is what decides that split.',
        'e-Way Bill (EWB) — the transport document required to move goods above a threshold value. Rule 55 Delivery Challan — a document used to move goods when you are not yet raising a tax invoice (job work, branch transfer, repair, testing, exhibition and so on). Reverse Charge — cases where the buyer, not the seller, pays the GST. B2B / B2C — a supply to another registered business (eligible for an IRN) versus to an end consumer.',
      ],
    },
    hi: {
      title: 'GST व लेखांकन शब्दावली',
      body: [
        'IRN (इनवॉइस संदर्भ संख्या) — e-invoice पंजीकृत होने पर सरकार द्वारा जारी अद्वितीय 64-अक्षर संख्या; यही इनवॉइस को कानूनी रूप से वैध बनाती है। Ack No (पावती संख्या) — IRN के साथ पोर्टल द्वारा लौटाई रसीद संख्या, हस्ताक्षरित प्रति पर छपी। Signed QR — पंजीकृत इनवॉइस पर आधिकारिक QR कोड जिसे कोई भी स्कैन कर सत्यापित कर सकता है।',
        'HSN / SAC — माल (HSN) या सेवा (SAC) हेतु GST वर्गीकरण कोड, जो कर-व्यवहार तय करता है। CGST + SGST बनाम IGST — अपने राज्य के भीतर बिक्री पर कर केंद्रीय व राज्य GST में बँटता है, जबकि दूसरे राज्य की बिक्री पर एकल एकीकृत GST लगता है। सप्लाई का स्थान (Place of Supply) — वह राज्य जहाँ सप्लाई मानी जाती है, जो यही बँटवारा तय करता है।',
        'e-Way Bill (EWB) — एक सीमा-मूल्य से अधिक माल की आवाजाही हेतु आवश्यक परिवहन दस्तावेज़। नियम 55 डिलीवरी चालान — माल भेजने का दस्तावेज़ जब आप अभी टैक्स इनवॉइस नहीं बना रहे (जॉब वर्क, शाखा स्थानांतरण, मरम्मत, परीक्षण, प्रदर्शनी आदि)। रिवर्स चार्ज — वे स्थितियाँ जहाँ GST विक्रेता नहीं, खरीदार भरता है। B2B / B2C — किसी अन्य पंजीकृत व्यवसाय को सप्लाई (IRN योग्य) बनाम अंतिम उपभोक्ता को।',
      ],
    },
  },
  {
    id: 'invoice_format', icon: FileText,
    en: {
      title: 'Tax invoice format, Measurement Sheet & letterhead',
      body: [
        'The Invoices screen produces a proper, branded tax-invoice PDF in the ARRAYS format: a coloured header band, a “Debited To” box for the buyer and a “Site Address” box for the works, an HSN/SAC items table, the totals (Total Amount → IGST, or CGST + SGST → Grand Total) and the amount in words. Long descriptions and long addresses wrap automatically and the boxes grow to fit — the text is never cut off or hidden.',
        'When you tick “Generate Measurement Sheet” while creating the invoice, the PDF gets a second page — a running-account sheet that shows, for each line, the Order quantity, the Previous / Present / Total quantity and the Previous / Present / Total amount. This is how progressive (running) EPC bills work: put what was billed in earlier bills into “Prev Qty”, what you are billing now into “Present Qty”, and the sheet adds them into the cumulative total. From an invoice you can download the full document (bill + measurement sheet) or just the bill on its own.',
        'The letterhead is editable per invoice. In the editor’s “Letterhead” box you can set the header name, the header address, the CIN and the email, and the footer slogan — leave any field blank to fall back to the company defaults. Click an invoice in the list to open a preview of everything (parties, items, totals) with one-click downloads, an Edit button and a Delete button.',
      ],
    },
    hi: {
      title: 'टैक्स इनवॉइस प्रारूप, मेज़रमेंट शीट व लेटरहेड',
      body: [
        'इनवॉइस स्क्रीन ARRAYS प्रारूप में एक उचित, ब्रांडेड टैक्स-इनवॉइस PDF बनाती है: एक रंगीन हेडर पट्टी, खरीदार के लिए “Debited To” बॉक्स और कार्य-स्थल के लिए “Site Address” बॉक्स, HSN/SAC आइटम तालिका, कुल योग (Total Amount → IGST, या CGST + SGST → Grand Total) और शब्दों में राशि। लंबे विवरण व लंबे पते स्वतः लपेटते (wrap) हैं और बॉक्स पाठ के अनुसार बढ़ते हैं — पाठ कभी कटता या छिपता नहीं।',
        'इनवॉइस बनाते समय “Generate Measurement Sheet” चुनने पर PDF में दूसरा पृष्ठ जुड़ता है — एक रनिंग-अकाउंट शीट जो हर पंक्ति के लिए Order मात्रा, Previous / Present / Total मात्रा और Previous / Present / Total राशि दिखाती है। प्रगतिशील (रनिंग) EPC बिल ऐसे ही चलते हैं: पिछले बिलों में बिल की गई मात्रा “Prev Qty” में डालें, अभी बिल कर रहे को “Present Qty” में, और शीट उन्हें संचयी कुल में जोड़ देती है। इनवॉइस से आप पूरा दस्तावेज़ (बिल + मेज़रमेंट शीट) या केवल बिल अलग से डाउनलोड कर सकते हैं।',
        'लेटरहेड हर इनवॉइस के लिए संपादन-योग्य है। संपादक के “Letterhead” बॉक्स में आप हेडर नाम, हेडर पता, CIN व ईमेल, और फ़ुटर स्लोगन सेट कर सकते हैं — कोई फ़ील्ड खाली छोड़ें तो कंपनी का डिफ़ॉल्ट लगेगा। सूची में किसी इनवॉइस पर क्लिक कर सब कुछ (पक्ष, आइटम, कुल) का पूर्वावलोकन खोलें, साथ में एक-क्लिक डाउनलोड, Edit और Delete।',
      ],
    },
  },
  {
    id: 'payment_terms', icon: Banknote,
    en: {
      title: 'Project payment terms & progress',
      body: [
        'Open any project to set its Payment Terms & Progress. Add the stages your contract pays in — for example “30% on material delivery”, “50% on installation”, “20% on commissioning” — each as a percentage of the contract value or as a fixed amount. The screen shows the due amount for every stage as you type.',
        'As the work is done, tick the circle next to a stage to mark it complete — it flips to “should be released”. Enter how much you have actually released against each stage. A summary strip rolls it all up: Scheduled (all terms), Work done → due, Released so far, and Pending to release. So you can see at a glance how much money the milestones say should have gone out, and whether it actually has.',
        'Projects (and each site) also carry a PO number and date, and a site can record its capacity in kW. A project can be edited any time, marked Complete when it is finished, or deleted — a deleted project moves to the Recovery Center and can be restored within 30 days.',
      ],
    },
    hi: {
      title: 'परियोजना भुगतान शर्तें व प्रगति',
      body: [
        'किसी परियोजना को खोलकर उसकी Payment Terms & Progress सेट करें। वे चरण जोड़ें जिनमें अनुबंध भुगतान करता है — जैसे “30% on material delivery”, “50% on installation”, “20% on commissioning” — हर एक अनुबंध-मूल्य के प्रतिशत के रूप में या निश्चित राशि के रूप में। टाइप करते ही स्क्रीन हर चरण की देय राशि दिखाती है।',
        'काम पूरा होने पर चरण के आगे गोले पर टिक कर उसे पूर्ण चिह्नित करें — वह “should be released” में बदल जाता है। हर चरण के सापेक्ष आपने वास्तव में कितना जारी किया, वह दर्ज करें। एक सारांश पट्टी सब जोड़ देती है: Scheduled (सभी शर्तें), Work done → due, Released so far, और Pending to release। इससे एक नज़र में दिखता है कि मील-पत्थरों के अनुसार कितना पैसा निकलना चाहिए था, और क्या वह निकला।',
        'परियोजनाएँ (और हर साइट) PO नंबर व दिनांक भी रखती हैं, और साइट अपनी क्षमता kW में दर्ज कर सकती है। परियोजना कभी भी संपादित की जा सकती है, समाप्त होने पर Complete चिह्नित की जा सकती है, या हटाई जा सकती है — हटाई गई परियोजना Recovery Center में जाती है और 30 दिनों के भीतर बहाल की जा सकती है।',
      ],
    },
  },
  {
    id: 'delete_recover', icon: LifeBuoy,
    en: {
      title: 'Deleting records & the 30-day Recovery Center',
      body: [
        'Deleting is safe. When you delete an invoice, an outgoing payment or a project, it is not erased — it moves to the System Recovery Center, and any accounting effect is reversed immediately (a payment’s debit is removed from the vendor/employee ledger, an invoice’s receivable is removed) so balances, the dashboard and the GST reconciliation update at once. e-Invoices, e-Way Bills and Delivery Challans behave the same way.',
        'To bring something back, open the Recovery Center, find the record under its group — Invoices, Outgoing Payments, Projects, e-Invoices, e-Way Bills or Delivery Challans — and click Recover. The record returns to its normal lists and its ledger entry is re-posted.',
        'Everything in the Recovery Center is kept for 30 days and then permanently removed by an automatic daily clean-up, so the recycle bin never grows forever. If you might still need a deleted record, recover it before the 30 days are up. For long-term safety keep regular full backups as well — those are separate from the Recovery Center, are stored in their own folder on this computer, and the ones you create by hand are not auto-deleted.',
      ],
    },
    hi: {
      title: 'रिकॉर्ड हटाना व 30-दिन रिकवरी सेंटर',
      body: [
        'हटाना सुरक्षित है। जब आप इनवॉइस, जावक भुगतान या परियोजना हटाते हैं, वह मिटती नहीं — System Recovery Center में जाती है, और उसका लेखांकन प्रभाव तुरंत उलट जाता है (भुगतान का डेबिट विक्रेता/कर्मचारी बही से हटता है, इनवॉइस का प्राप्य हटता है) ताकि बैलेंस, डैशबोर्ड और GST समाधान तुरंत अपडेट हों। e-Invoice, e-Way Bill व डिलीवरी चालान भी ऐसे ही व्यवहार करते हैं।',
        'किसी चीज़ को वापस लाने के लिए Recovery Center खोलें, रिकॉर्ड को उसके समूह में ढूँढें — Invoices, Outgoing Payments, Projects, e-Invoices, e-Way Bills या Delivery Challans — और Recover पर क्लिक करें। रिकॉर्ड अपनी सामान्य सूचियों में लौट आता है और उसकी बही प्रविष्टि फिर से दर्ज हो जाती है।',
        'Recovery Center में सब कुछ 30 दिनों तक रखा जाता है, फिर एक स्वतः दैनिक सफ़ाई द्वारा स्थायी रूप से हटा दिया जाता है, ताकि रीसायकल बिन कभी अनंत न बढ़े। यदि कोई हटाया रिकॉर्ड अब भी चाहिए हो, तो 30 दिन बीतने से पहले उसे वापस लाएँ। दीर्घकालिक सुरक्षा हेतु नियमित पूर्ण बैकअप भी रखें — वे Recovery Center से अलग हैं, इसी कंप्यूटर पर अपने फ़ोल्डर में रखे जाते हैं, और जो आप स्वयं बनाते हैं वे स्वतः नहीं हटते।',
      ],
    },
  },
  {
    id: 'auto_match', icon: UserRound,
    en: {
      title: 'Auto-linking payments to vendors & employees',
      body: [
        'When you upload a payment screenshot, the app reads the beneficiary name and amount and automatically selects the matching vendor from your master — even when the bank text is messy, with extra words, honorifics like “MR”, “S/O …” tails or NEFT/RTGS/UPI noise. If the auto-pick is wrong you can always change the vendor before saving; the more consistent your vendor names, the better the match.',
        'If you choose Employee as the payee but that person is not in the Employee Master yet, simply saving the payment creates the employee automatically from the beneficiary name (or links to a close existing match), and posts the amount to their ledger. So you never have to pre-create a payee just to record a payment — clean up the details (bank, PAN, designation) later from the Employees screen.',
      ],
    },
    hi: {
      title: 'भुगतान को विक्रेता व कर्मचारी से स्वतः जोड़ना',
      body: [
        'जब आप भुगतान का स्क्रीनशॉट अपलोड करते हैं, ऐप लाभार्थी नाम व राशि पढ़कर आपके मास्टर से मिलते-जुलते विक्रेता को स्वतः चुन लेता है — भले बैंक का पाठ गड़बड़ हो, अतिरिक्त शब्द, “MR” जैसे आदरसूचक, “S/O …” पूँछ या NEFT/RTGS/UPI शोर हो। यदि स्वतः-चयन गलत हो तो सहेजने से पहले विक्रेता बदल सकते हैं; विक्रेता नाम जितने एक-समान होंगे, मिलान उतना बेहतर।',
        'यदि आप भुगतान-पात्र के रूप में Employee चुनते हैं पर वह व्यक्ति अभी Employee Master में नहीं है, तो भुगतान सहेजते ही लाभार्थी नाम से कर्मचारी स्वतः बन जाता है (या किसी निकट मौजूदा से जुड़ जाता है) और राशि उसकी बही में दर्ज हो जाती है। इसलिए सिर्फ़ भुगतान दर्ज करने के लिए पहले से पात्र बनाने की ज़रूरत नहीं — विवरण (बैंक, PAN, पदनाम) बाद में Employees स्क्रीन से ठीक कर लें।',
      ],
    },
  },
  {
    id: 'own_accounts_transfers', icon: Banknote,
    en: {
      title: 'Own bank accounts & internal transfers',
      body: [
        'Under Ledgers → Own Bank Accounts, list every account your business owns — the current account, the OD/CC account, savings, anything you move money between. This one list is what stops the software from mistaking your own money movements for real business.',
        'When you move money between your own accounts (for example OD → current), the receiving account shows a credit. Without this list the app would wrongly count that as income and even invent a “client” for your own company. Once the account is listed, such a line is tagged an internal transfer: it is excluded from your income and expense totals, and no client or vendor is created for it. The same applies to loan/OD drawdowns and repayments — mark them “Financing” and they stay out of your operating figures.',
        'Already have old data that counted transfers as income? Open Own Bank Accounts and click “Re-scan existing” — it re-checks every past payment and receipt against your list, re-tags the transfers and reverses their ledger entries, so your historical totals become correct too.',
      ],
    },
    hi: {
      title: 'अपने बैंक खाते व आंतरिक स्थानांतरण',
      body: [
        'Ledgers → Own Bank Accounts में अपने व्यवसाय के हर खाते को सूचीबद्ध करें — चालू खाता, OD/CC खाता, बचत, और वे सब जिनके बीच आप पैसा भेजते हैं। यही सूची सॉफ़्टवेयर को आपके अपने पैसे के संचलन को असली व्यवसाय समझने से रोकती है।',
        'जब आप अपने खातों के बीच पैसा भेजते हैं (जैसे OD → चालू), प्राप्त करने वाला खाता एक credit दिखाता है। इस सूची के बिना ऐप इसे गलती से आय गिन लेता और आपकी अपनी कंपनी के लिए “client” तक बना देता। खाता सूचीबद्ध होने पर ऐसी पंक्ति आंतरिक स्थानांतरण के रूप में चिह्नित होती है: आय व व्यय योग से बाहर, और कोई ग्राहक/विक्रेता नहीं बनता। यही ऋण/OD निकासी व चुकौती पर लागू होता है — उन्हें “Financing” चिह्नित करें और वे परिचालन आँकड़ों से बाहर रहते हैं।',
        'पुराना डेटा जिसमें स्थानांतरण आय के रूप में गिने गए? Own Bank Accounts खोलें और “Re-scan existing” दबाएँ — यह हर पुराने भुगतान व प्राप्ति को आपकी सूची से पुनः जाँचता है, स्थानांतरणों को पुनः चिह्नित करता है और उनकी बही प्रविष्टियाँ उलट देता है, ताकि आपके पुराने योग भी सही हो जाएँ।',
      ],
    },
  },
  {
    id: 'duplicates_health', icon: ShieldCheck,
    en: {
      title: 'Duplicates, editing entries & statement health',
      body: [
        'A bank statement is the source of truth: every debit and credit on it should map to one recorded transaction. So never delete an extra entry that came from a statement — deleting it makes that statement stop reconciling. Instead open the payment or receipt and click “Mark Duplicate”. A duplicate stays on record and stays linked to its statement line, but it is counted nowhere — no ledger, and out of every total. You can “Unmark” it later.',
        'If you spot a typo — a wrong amount, date, beneficiary, project or note — you no longer need to delete and re-enter. Open the payment or receipt and click Edit; the form opens pre-filled and, on save, the ledger is re-posted correctly.',
        'On the Bank Reconciliation screen the software checks statement health automatically. A “Missing” card and, when needed, a red banner tell you if any transaction that was on a statement has since been deleted, and each affected statement shows a red badge. Click a statement’s Health button for the exact list. You can also delete a whole statement (its parsed lines go, but the real payments and receipts stay), and open the original statement file right from its page.',
      ],
    },
    hi: {
      title: 'डुप्लिकेट, प्रविष्टि संपादन व स्टेटमेंट स्वास्थ्य',
      body: [
        'बैंक स्टेटमेंट सत्य का स्रोत है: उस पर हर debit व credit एक दर्ज लेनदेन से मेल खाना चाहिए। इसलिए स्टेटमेंट से आई अतिरिक्त प्रविष्टि कभी न हटाएँ — हटाने से वह स्टेटमेंट मिलान करना बंद कर देता है। इसके बजाय भुगतान या प्राप्ति खोलें और “Mark Duplicate” दबाएँ। डुप्लिकेट रिकॉर्ड पर बना रहता है और अपनी स्टेटमेंट पंक्ति से जुड़ा रहता है, पर कहीं नहीं गिना जाता — न बही में, न किसी योग में। बाद में “Unmark” भी कर सकते हैं।',
        'कोई टाइपो दिखे — गलत राशि, दिनांक, लाभार्थी, परियोजना या टिप्पणी — तो अब हटाकर दोबारा दर्ज करने की ज़रूरत नहीं। भुगतान या प्राप्ति खोलें और Edit दबाएँ; फ़ॉर्म पहले से भरा खुलता है और सहेजने पर बही सही से पुनः दर्ज होती है।',
        'Bank Reconciliation स्क्रीन पर सॉफ़्टवेयर स्टेटमेंट स्वास्थ्य स्वतः जाँचता है। एक “Missing” कार्ड और ज़रूरत होने पर लाल बैनर बताते हैं कि क्या स्टेटमेंट पर मौजूद कोई लेनदेन बाद में हटाया गया, और हर प्रभावित स्टेटमेंट लाल बैज दिखाता है। सटीक सूची के लिए स्टेटमेंट का Health बटन दबाएँ। आप पूरा स्टेटमेंट भी हटा सकते हैं (उसकी पंक्तियाँ जाती हैं, पर असली भुगतान-प्राप्तियाँ बनी रहती हैं), और मूल स्टेटमेंट फ़ाइल उसी पेज से खोल सकते हैं।',
      ],
    },
  },
  {
    id: 'cloud_data', icon: CloudUpload,
    en: {
      title: 'Cloud publishing & your one data file',
      body: [
        'Publish to Cloud sends only your data — the numbers and text of every record — to a cloud database so the read-only Admin can review everything on the web. Your heavy files (proof screenshots, statements, PDFs) never leave this computer, keeping the cloud fast and light. Publishing now happens automatically after every change and again when you sign out, so the cloud stays current on its own; the manual “Publish to Cloud Now” button is still there whenever you want it.',
        'From Data & Admin you can also click “Download All Data (JSON)” to save the entire database — every record shown anywhere in the app, from payments to audit history — as one lightweight file, with no images or attachments. It is the same data that goes to the cloud, so it doubles as a portable, human-readable snapshot you can keep as a light backup or move between machines.',
        'Full backups (Backup & Restore) are different and larger: they bundle the data plus every uploaded file into one dated archive on this computer, and run automatically every couple of hours. Use a full backup to restore everything; use the JSON export when you just want the data.',
      ],
    },
    hi: {
      title: 'क्लाउड प्रकाशन व आपकी एक डेटा फ़ाइल',
      body: [
        'Publish to Cloud केवल आपका डेटा भेजता है — हर रिकॉर्ड की संख्याएँ व पाठ — एक क्लाउड डेटाबेस में, ताकि केवल-दृश्य Admin वेब पर सब देख सके। आपकी भारी फ़ाइलें (प्रूफ़ स्क्रीनशॉट, स्टेटमेंट, PDF) कभी इस कंप्यूटर से बाहर नहीं जातीं, जिससे क्लाउड तेज़ व हल्का रहता है। प्रकाशन अब हर बदलाव के बाद और साइन-आउट पर स्वतः होता है, इसलिए क्लाउड स्वयं अद्यतन रहता है; “Publish to Cloud Now” बटन भी जब चाहें उपलब्ध है।',
        'Data & Admin से आप “Download All Data (JSON)” दबाकर पूरा डेटाबेस — भुगतान से ऑडिट इतिहास तक, ऐप में कहीं भी दिखने वाला हर रिकॉर्ड — एक हल्की फ़ाइल के रूप में सहेज सकते हैं, बिना किसी छवि या संलग्नक के। यह वही डेटा है जो क्लाउड जाता है, इसलिए यह एक पोर्टेबल, पठनीय स्नैपशॉट भी है जिसे हल्के बैकअप के रूप में रख सकते हैं या मशीनों के बीच ले जा सकते हैं।',
        'पूर्ण बैकअप (Backup & Restore) अलग व बड़े होते हैं: वे डेटा के साथ हर अपलोड की गई फ़ाइल को एक दिनांकित अभिलेख में इसी कंप्यूटर पर बंडल करते हैं, और हर कुछ घंटों में स्वतः चलते हैं। सब कुछ पुनर्स्थापित करने के लिए पूर्ण बैकअप उपयोग करें; केवल डेटा चाहिए तो JSON निर्यात उपयोग करें।',
      ],
    },
  },
];

const CATS = [
  { id: 'all', en: 'All topics', hi: 'सभी विषय' },
  { id: 'start', en: 'Getting Started', hi: 'शुरुआत' },
  { id: 'workflows', en: 'Daily Workflows', hi: 'रोज़ के कार्य' },
  { id: 'gst', en: 'GST Compliance', hi: 'GST अनुपालन' },
  { id: 'access', en: 'Roles & Access', hi: 'भूमिकाएँ व पहुँच' },
  { id: 'safety', en: 'Backup & Safety', hi: 'बैकअप व सुरक्षा' },
  { id: 'help', en: 'Troubleshooting', hi: 'समस्या-समाधान' },
];
const CAT_OF = {
  start: 'start', operate: 'start', dashboard: 'start', language: 'start', search: 'start',
  payments: 'workflows', receipts: 'workflows', reconciliation: 'workflows', vendors: 'workflows',
  clients: 'workflows', invoices: 'workflows', challans: 'workflows', quotes: 'workflows', reports: 'workflows',
  projects: 'workflows', employees: 'workflows', documents: 'workflows',
  gst: 'gst', gst_flow: 'gst', gst_manage: 'gst', gst_letterhead: 'gst', portal_login: 'gst',
  gst_dashboard: 'gst', gst_recon: 'gst',
  roles: 'access', passwords: 'access',
  backup: 'safety', recovery: 'safety', protection: 'safety', security: 'safety', activity: 'safety',
  troubleshooting: 'help', glossary: 'help',
};

export default function Help() {
  const { lang } = useI18n();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const isHi = lang === 'hi';

  const query = q.trim().toLowerCase();
  const visible = SECTIONS.filter((s) => {
    if (cat !== 'all' && CAT_OF[s.id] !== cat) return false;
    if (!query) return true;
    const c = s[isHi ? 'hi' : 'en'];
    return c.title.toLowerCase().includes(query) || c.body.some((p) => p.toLowerCase().includes(query));
  });
  const grouped = CATS.filter((k) => k.id !== 'all')
    .map((k) => ({ cat: k, items: visible.filter((s) => CAT_OF[s.id] === k.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <PageHeader
        title={isHi ? 'सहायता और उपयोगकर्ता मार्गदर्शिका' : 'Help & User Guide'}
        subtitle={isHi
          ? 'हर सुविधा की पूरी मार्गदर्शिका, सरल भाषा में। ऊपर की पट्टी से भाषा बदलें (EN / हिं)।'
          : 'A complete, plain-language guide to every feature. Switch the language from the top bar (EN / हिं).'}
      />

      <Card className="mb-4 !p-3">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={isHi ? 'सहायता में खोजें…' : 'Search help…'} value={q} onChange={(e) => setQ(e.target.value)} data-no-i18n />
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {CATS.map((k) => (
          <button key={k.id} onClick={() => setCat(k.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${cat === k.id ? 'bg-brand-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
            {k[isHi ? 'hi' : 'en']}
          </button>
        ))}
      </div>

      {!query && (
        <div className="mb-5 flex flex-wrap gap-2">
          {visible.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <s.icon size={13} /> {s[isHi ? 'hi' : 'en'].title}
            </a>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {grouped.map((g) => (
          <section key={g.cat.id}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
              {g.cat[isHi ? 'hi' : 'en']}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800">{g.items.length}</span>
            </h2>
            <div className="space-y-4">
              {g.items.map((s) => {
                const c = s[isHi ? 'hi' : 'en'];
                return (
                  <Card key={s.id} id={s.id} className="scroll-mt-20">
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 rounded-xl bg-brand-50 p-3 text-brand-600 dark:bg-brand-900/30">
                        <s.icon size={22} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{c.title}</h3>
                        {c.body.map((p, i) => (
                          <p key={i} className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p}</p>
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
        {visible.length === 0 && (
          <Card><p className="text-center text-sm text-slate-400">{isHi ? 'कोई परिणाम नहीं मिला।' : 'No matching help topics.'}</p></Card>
        )}
      </div>
    </div>
  );
}
