import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Loading } from './components/ui/index.jsx';
import Layout from './components/layout/Layout.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Payments from './pages/Payments.jsx';
import Receipts from './pages/Receipts.jsx';
import Invoices from './pages/Invoices.jsx';
import Reconciliation from './pages/Reconciliation.jsx';
import ReconciliationDetail from './pages/ReconciliationDetail.jsx';
import Vendors from './pages/Vendors.jsx';
import VendorLedger from './pages/VendorLedger.jsx';
import Employees from './pages/Employees.jsx';
import EmployeeLedger from './pages/EmployeeLedger.jsx';
import Clients from './pages/Clients.jsx';
import OwnAccounts from './pages/OwnAccounts.jsx';
import ClientLedger from './pages/ClientLedger.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Reports from './pages/Reports.jsx';
import Audit from './pages/Audit.jsx';
import Users from './pages/Users.jsx';
import System from './pages/System.jsx';
import Quotes from './pages/Quotes.jsx';
import QuoteBuilder from './pages/QuoteBuilder.jsx';
import DeliveryChallans from './pages/DeliveryChallans.jsx';
import RecoveryCenter from './pages/RecoveryCenter.jsx';
import About from './pages/About.jsx';
import Help from './pages/Help.jsx';
import GstDashboard from './pages/GstDashboard.jsx';
import GstCompliance from './pages/GstCompliance.jsx';
import GstReports from './pages/GstReports.jsx';
import GstRecon from './pages/GstRecon.jsx';
import GstNotifications from './pages/GstNotifications.jsx';
import GstHealth from './pages/GstHealth.jsx';
import GstActivity from './pages/GstActivity.jsx';
import GstBranches from './pages/GstBranches.jsx';
import GstSeries from './pages/GstSeries.jsx';
import GstImport from './pages/GstImport.jsx';
import GstSchedules from './pages/GstSchedules.jsx';
import GstBackup from './pages/GstBackup.jsx';
import GstDiagnostics from './pages/GstDiagnostics.jsx';
import GstReadiness from './pages/GstReadiness.jsx';
import GstSystem from './pages/GstSystem.jsx';
import GstBranding from './pages/GstBranding.jsx';
import GstFeed from './pages/GstFeed.jsx';
import { ActivityHub, ReportsHub, SystemStatusHub, DataAdminHub } from './pages/Hubs.jsx';
import GstIntegrations from './pages/GstIntegrations.jsx';

function Protected({ children, adminOnly, editorOnly }) {
  const { user, loading, isAdmin, isEditor } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (editorOnly && !isEditor) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/reconciliation/:id" element={<ReconciliationDetail />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/vendors/:id" element={<VendorLedger />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/employees/:id" element={<EmployeeLedger />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/own-accounts" element={<Protected editorOnly><OwnAccounts /></Protected>} />
        <Route path="/clients/:id" element={<ClientLedger />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/quotes/new" element={<QuoteBuilder />} />
        <Route path="/quotes/:id" element={<QuoteBuilder />} />
        <Route path="/challans" element={<DeliveryChallans />} />
        <Route path="/recovery" element={<RecoveryCenter />} />
        <Route path="/gst" element={<GstDashboard />} />
        <Route path="/gst/compliance" element={<GstCompliance />} />
        <Route path="/gst/reconciliation" element={<GstRecon />} />
        <Route path="/gst/notifications" element={<GstNotifications />} />
        <Route path="/gst/activity" element={<GstActivity />} />
        <Route path="/gst/health" element={<Protected adminOnly><GstHealth /></Protected>} />
        <Route path="/gst/branches" element={<Protected editorOnly><GstBranches /></Protected>} />
        <Route path="/gst/number-series" element={<Protected editorOnly><GstSeries /></Protected>} />
        <Route path="/gst/import" element={<Protected editorOnly><GstImport /></Protected>} />
        <Route path="/gst/schedules" element={<GstSchedules />} />
        <Route path="/gst/backup" element={<GstBackup />} />
        <Route path="/gst/diagnostics" element={<Protected adminOnly><GstDiagnostics /></Protected>} />
        <Route path="/gst/readiness" element={<Protected adminOnly><GstReadiness /></Protected>} />
        <Route path="/gst/system" element={<Protected editorOnly><GstSystem /></Protected>} />
        <Route path="/gst/branding" element={<Protected editorOnly><GstBranding /></Protected>} />
        <Route path="/gst/integrations" element={<Protected editorOnly><GstIntegrations /></Protected>} />
        <Route path="/gst/feed" element={<GstFeed />} />
        <Route path="/gst/reports" element={<GstReports />} />
        <Route path="/about" element={<About />} />
        <Route path="/help" element={<Help />} />
        {/* Consolidated hubs (merge several screens into one tabbed page) */}
        <Route path="/reports" element={<ReportsHub />} />
        <Route path="/activity" element={<ActivityHub />} />
        <Route path="/status" element={<Protected adminOnly><SystemStatusHub /></Protected>} />
        <Route path="/system" element={<Protected editorOnly><DataAdminHub /></Protected>} />
        {/* Standalone routes kept so existing deep links still work */}
        <Route path="/reports/financial" element={<Reports />} />
        <Route path="/audit" element={<Protected adminOnly><Audit /></Protected>} />
        <Route path="/users" element={<Protected editorOnly><Users /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
