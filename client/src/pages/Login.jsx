import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Sun, Loader2, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../api/client.js';
import { company } from '../config/company.js';
import Modal from '../components/ui/Modal.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Staggered entrance for the form panel. Honors prefers-reduced-motion via the
// MotionConfig wrapper below, which neutralizes transforms for those users.
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [welcome, setWelcome] = useState(false);

  if (user && !welcome) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = await login(loginId.trim().toLowerCase(), password);
      // Admin-only welcome pop-up (shown once, right after login).
      if (u?.role === 'admin') setWelcome(true);
      else navigate('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-full">
        {/* Brand panel */}
        <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-12 text-white lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Sun size={24} />
            </div>
            <div className="leading-tight">
              <span className="block text-lg font-bold">{company.shortName}</span>
              <span className="text-[11px] font-medium text-brand-100">{company.brandLine}</span>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
          >
            <h1 className="text-4xl font-extrabold leading-tight">
              Financial Data AIPL
            </h1>
            <p className="mt-4 max-w-md text-brand-100">
              {company.name} — centralize payments, receipts, ledgers, invoicing, IDBI bank
              reconciliation, solar quotations and project profitability in one premium command center.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
              {['IDBI statement intelligence', 'Vendor auto-mapping', 'Solar quotation engine', 'Real-time analytics'].map((f, i) => (
                <motion.div
                  key={f}
                  className="flex items-center gap-2 text-brand-50"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut', delay: 0.25 + i * 0.07 }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-200" /> {f}
                </motion.div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {company.certifications.map((c) => (
                <span key={c} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">{c}</span>
              ))}
            </div>
          </motion.div>
          <p className="text-xs text-brand-200">© {new Date().getFullYear()} {company.name} — Enterprise Edition</p>
        </div>

        {/* Form panel */}
        <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
          <motion.div className="w-full max-w-sm" variants={container} initial="hidden" animate="show">
            <motion.div variants={item} className="mb-8 flex items-center gap-2.5 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Sun size={22} />
              </div>
              <span className="text-lg font-bold">{company.shortName}</span>
            </motion.div>

            <motion.h2 variants={item} className="text-2xl font-bold text-slate-900 dark:text-white">Welcome back</motion.h2>
            <motion.p variants={item} className="mt-1 text-sm text-slate-500">Sign in to your operational dashboard.</motion.p>

            <form onSubmit={submit} className="mt-8 space-y-4">
              <motion.div variants={item} className="space-y-1.5">
                <Label htmlFor="loginId">ID</Label>
                <Input
                  id="loginId"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your ID"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                />
              </motion.div>
              <motion.div variants={item} className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </motion.div>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                    role="alert"
                  >
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {error}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div variants={item}>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-400"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <>Sign in <ArrowRight size={18} /></>}
                </Button>
              </motion.div>
            </form>
          </motion.div>
        </div>

        {/* Admin-only welcome pop-up */}
        <Modal
          open={welcome}
          onClose={() => { setWelcome(false); navigate('/'); }}
          title={`Welcome to ${company.shortName}`}
          size="sm"
          footer={
            <button className="btn-primary" onClick={() => { setWelcome(false); navigate('/'); }}>
              Continue
            </button>
          }
        >
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
              <ShieldCheck size={28} />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              Welcome, Lieutenant General Dr. A.R. Prasad, AVSM, VSM, ADC, Ph.D.
            </p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Former Signal Officer-in-Chief &amp; Senior Colonel Commandant
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Thank you for leading {company.shortName} with vision, excellence, and integrity.
              We wish you a productive and successful day ahead.
            </p>
          </div>
        </Modal>
      </div>
    </MotionConfig>
  );
}
