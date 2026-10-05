// Indian-rupee + number/date formatting helpers used across the app.

export const inr = (value, { compact = false } = {}) => {
  const n = Number(value || 0);
  if (compact) {
    // Indian numbering: Crore (1,00,00,000) and Lakh (1,00,000); below a lakh
    // show the full Indian-grouped value (no Western "K").
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
    return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
};

export const num = (value) =>
  new Intl.NumberFormat('en-IN').format(Number(value || 0));

// Today's date in India (Asia/Kolkata) as YYYY-MM-DD. Use this for every date
// DEFAULT — never `new Date().toISOString().slice(0,10)`, which is the UTC date
// and reads as "yesterday" in IST during the early-morning hours.
export const todayISO = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export const titleCase = (s) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
