// ============================================================================
//  §6 + §13 Data-loss protection (all local).
//  • beforeunload guard — browser warns before tab close / refresh / crash when
//    any form has unsaved edits.
//  • useUnsavedGuard(isDirty) — a form registers its dirty state.
//  • useDraft / loadDraft / clearDraft — auto-save in-progress forms to
//    localStorage so a crash / power loss / accidental close never loses work.
// ============================================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const Ctx = createContext(null);

export function UnsavedChangesProvider({ children }) {
  const [dirtyCount, setDirtyCount] = useState(0);

  useEffect(() => {
    if (dirtyCount <= 0) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCount]);

  const markDirty = useCallback(() => setDirtyCount((n) => n + 1), []);
  const markClean = useCallback(() => setDirtyCount((n) => Math.max(0, n - 1)), []);

  return <Ctx.Provider value={{ dirty: dirtyCount > 0, markDirty, markClean }}>{children}</Ctx.Provider>;
}

export const useUnsaved = () => useContext(Ctx) || { dirty: false, markDirty() {}, markClean() {} };

// Register a form's dirty state — adds/removes the global beforeunload guard.
export function useUnsavedGuard(isDirty) {
  const { markDirty, markClean } = useUnsaved();
  useEffect(() => {
    if (!isDirty) return undefined;
    markDirty();
    return () => markClean();
  }, [isDirty, markDirty, markClean]);
}

// ── Draft auto-save (§13) ────────────────────────────────────────────────────
const DRAFT_PREFIX = 'epc_draft:';
export function useDraft(key, value, enabled = true) {
  useEffect(() => {
    if (!enabled || !key) return undefined;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify({ at: Date.now(), value })); } catch { /* quota */ }
    }, 700);
    return () => clearTimeout(t);
  }, [key, value, enabled]);
}
export function loadDraft(key) {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_PREFIX + key)); return d?.value ?? null; } catch { return null; }
}
export function clearDraft(key) {
  try { localStorage.removeItem(DRAFT_PREFIX + key); } catch { /* ignore */ }
}
