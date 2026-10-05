import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Sun, X } from 'lucide-react';
import { NAV } from './nav.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { company } from '../../config/company.js';

export default function Sidebar({ open, onClose }) {
  const { isAdmin, isEditor } = useAuth();

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-100 px-5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
              <Sun size={20} />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{company.shortName}</p>
              <p className="text-[11px] font-medium text-slate-400">{company.brandLine}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 lg:hidden">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => {
            const items = group.items.filter((i) => (!i.adminOnly || isAdmin) && (!i.editorOnly || isEditor));
            if (!items.length) return null;
            return (
              <div key={group.section} className="mb-5">
                <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {group.section}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        clsx(
                          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                          isActive
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                        )
                      }
                    >
                      <item.icon size={18} className="shrink-0" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 px-5 py-4 text-[11px] text-slate-400 dark:border-slate-800">
          v1.0 • Built by Siddhant Kumar
        </div>
      </aside>
    </>
  );
}
