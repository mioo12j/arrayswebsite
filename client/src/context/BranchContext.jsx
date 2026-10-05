import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../api/client.js';

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchIdState] = useState(() => localStorage.getItem('gst_branch') || 'all');

  const load = useCallback(() => {
    if (!localStorage.getItem('epc_token')) return;
    api.get('/gst/branches').then(({ data }) => setBranches(data || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const setBranchId = useCallback((id) => {
    if (id && id !== 'all') localStorage.setItem('gst_branch', id);
    else localStorage.removeItem('gst_branch');
    setBranchIdState(id || 'all');
  }, []);

  const activeBranch = branches.find((b) => b.id === branchId) || null;
  // Query-string fragment for branch-aware GST fetches.
  const branchQS = branchId && branchId !== 'all' ? `branch_id=${branchId}` : '';

  return (
    <BranchContext.Provider value={{ branches, branchId, setBranchId, activeBranch, branchQS, reloadBranches: load }}>
      {children}
    </BranchContext.Provider>
  );
}

export const useBranch = () => useContext(BranchContext) || { branches: [], branchId: 'all', setBranchId: () => {}, activeBranch: null, branchQS: '', reloadBranches: () => {} };
