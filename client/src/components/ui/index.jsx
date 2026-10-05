import clsx from 'clsx';
import { Loader2, Inbox } from 'lucide-react';
import { titleCase } from '../../lib/format.js';

export function Card({ className, children, ...rest }) {
  return (
    <div className={clsx('card p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={clsx('animate-spin text-brand-500', className)} size={20} />;
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
      <Spinner /> <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800">
        <Inbox className="text-slate-400" size={28} />
      </div>
      <p className="font-semibold text-slate-700 dark:text-slate-300">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-400">{hint}</p>}
    </div>
  );
}

const BADGE_TONES = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  blue: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

// Maps known status strings to a tone.
const STATUS_TONE = {
  paid: 'green', closed: 'green', matched: 'green', attached: 'green', active: 'green', geo_verified: 'green',
  pending: 'amber', partially_paid: 'amber', sent: 'blue', raised: 'blue', draft: 'slate', in_transit: 'amber',
  overdue: 'red', unmatched: 'red', duplicate: 'purple', cancelled: 'red',
};

export function Badge({ children, tone, status, className }) {
  const t = tone || STATUS_TONE[status] || 'slate';
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        BADGE_TONES[t],
        className
      )}
    >
      {children ?? titleCase(status)}
    </span>
  );
}

// Read-only definition list — used by the payment / receipt detail views.
export function DescList({ children, className }) {
  return <dl className={clsx('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2', className)}>{children}</dl>;
}

export function DescRow({ label, children, wide, mono }) {
  const empty =
    children === undefined || children === null || children === '' ||
    (Array.isArray(children) && children.length === 0);
  if (empty) return null;
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={clsx('mt-0.5 break-words text-sm text-slate-800 dark:text-slate-100', mono && 'font-mono')}>
        {children}
      </dd>
    </div>
  );
}

export function Field({ label, children, required, hint, className }) {
  return (
    <div className={className}>
      <label className="label">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Table({ columns, rows, empty = 'No records', renderRow, onRowClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            {columns.map((c) => (
              <th key={c.key || c.header} className={clsx('th', c.align === 'right' && 'text-right')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="td text-center text-slate-400">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id || i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'transition hover:bg-slate-50 dark:hover:bg-slate-800/40',
                  onRowClick && 'cursor-pointer'
                )}
              >
                {renderRow(row)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
