import {
  LayoutDashboard, FolderKanban, ArrowUpRight, ArrowDownLeft, FileText,
  Building2, Users, Banknote, ScrollText, BarChart3, ShieldCheck, UserCog,
  Calculator, Info, UserRound, DatabaseZap, HelpCircle, FileCheck2, Truck, ReceiptText,
  GitCompareArrows, Bell, Activity, HeartPulse, Building2 as BranchIcon, Hash,
  CalendarClock, DatabaseBackup, UploadCloud, Stethoscope, ClipboardCheck, Settings, Palette, Rss, Plug, LifeBuoy, Wallet,
} from 'lucide-react';

// `adminOnly` hides the item from operators.
export const NAV = [
  { section: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  ]},
  { section: 'Operations', items: [
    { to: '/payments', label: 'Outgoing Payments', icon: ArrowUpRight },
    { to: '/receipts', label: 'Incoming Receipts', icon: ArrowDownLeft },
    { to: '/invoices', label: 'Invoices', icon: FileText },
    { to: '/reconciliation', label: 'Bank Reconciliation', icon: Banknote },
  ]},
  { section: 'Ledgers', items: [
    { to: '/vendors', label: 'Vendor Master', icon: Building2 },
    { to: '/employees', label: 'Employees', icon: UserRound },
    { to: '/clients', label: 'Clients', icon: Users },
    { to: '/own-accounts', label: 'Own Bank Accounts', icon: Wallet, editorOnly: true },
  ]},
  { section: 'Sales & Delivery', items: [
    { to: '/quotes', label: 'Quotes & Estimation', icon: Calculator },
    { to: '/challans', label: 'Delivery Challans', icon: Truck },
    { to: '/projects', label: 'Projects & Sites', icon: FolderKanban },
  ]},
  { section: 'GST e-Invoicing', items: [
    { to: '/gst', label: 'GST Dashboard', icon: FileCheck2, end: true },
    { to: '/gst/compliance', label: 'e-Invoice & E-Way Bill', icon: ReceiptText },
    { to: '/gst/reconciliation', label: 'GST Reconciliation', icon: GitCompareArrows },
  ]},
  { section: 'Setup', items: [
    { to: '/gst/branches', label: 'Offices & GSTINs', icon: BranchIcon, editorOnly: true },
    { to: '/gst/number-series', label: 'Number Series', icon: Hash, editorOnly: true },
    { to: '/gst/branding', label: 'Branding', icon: Palette, editorOnly: true },
    { to: '/gst/import', label: 'Import Wizard', icon: UploadCloud, editorOnly: true },
    { to: '/status', label: 'System Status', icon: HeartPulse, adminOnly: true },
  ]},
  { section: 'Intelligence', items: [
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/activity', label: 'Activity & Audit', icon: Activity },
    { to: '/gst/backup', label: 'Backup & Restore', icon: DatabaseBackup },
    { to: '/recovery', label: 'Recovery Center', icon: LifeBuoy },
    { to: '/users', label: 'User Management', icon: UserCog, editorOnly: true },
    { to: '/system', label: 'Data & Admin', icon: DatabaseZap, editorOnly: true },
  ]},
  { section: 'Company', items: [
    { to: '/help', label: 'Help & Guide', icon: HelpCircle },
    { to: '/about', label: 'About', icon: Info },
  ]},
];

export { ShieldCheck };
