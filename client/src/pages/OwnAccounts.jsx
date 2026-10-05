import { useState } from 'react';
import { Plus, Loader2, Trash2, Pencil, Wallet, RefreshCw } from 'lucide-react';
import { api, apiError } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useToast } from '../components/ui/Toast.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Card, PageHeader, Loading, Table, Badge, Field } from '../components/ui/index.jsx';

const TYPE_LABEL = { current: 'Current', od: 'OD / Cash Credit', savings: 'Savings', cc: 'Credit Card', other: 'Other' };

export default function OwnAccounts() {
  const toast = useToast();
  const { data: rows, loading, refetch } = useFetch('/own-accounts');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {…} = edit
  const [rescanning, setRescanning] = useState(false);

  const rescan = async () => {
    if (!window.confirm('Re-scan all existing payments and receipts against this list? Any that are actually transfers between your own accounts will be re-tagged and removed from your income/expense totals (their party ledger entries are reversed). This is safe and can be run again anytime.')) return;
    setRescanning(true);
    try {
      const { data } = await api.post('/own-accounts/reclassify');
      if (data.note) toast.info(data.note);
      else toast.success(`Re-tagged ${data.payments} payment(s) and ${data.receipts} receipt(s) as internal transfers.`);
    } catch (err) { toast.error(apiError(err)); } finally { setRescanning(false); }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove own account "${row.label || row.account_number}"? Transfers to/from it will no longer be auto-detected.`)) return;
    try {
      await api.delete(`/own-accounts/${row.id}`);
      toast.success('Removed');
      refetch();
    } catch (err) { toast.error(apiError(err)); }
  };

  return (
    <div>
      <PageHeader
        title="Own Bank Accounts"
        subtitle="Your OWN accounts (OD, current, savings). Money moving between these is an internal transfer — never counted as income or expense, and never treated as a client or vendor."
        actions={<>
          <button className="btn-ghost" onClick={rescan} disabled={rescanning}>
            {rescanning ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Re-scan existing
          </button>
          <button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add Own Account</button>
        </>}
      />

      <Card className="mb-4 border-brand-100 bg-brand-50/50 dark:border-brand-900/40 dark:bg-brand-900/10">
        <div className="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
          <Wallet size={18} className="mt-0.5 shrink-0 text-brand-600" />
          <p>
            When a bank statement (or a payment/receipt) has one of these accounts as the counterparty, the transaction is
            marked an <strong>internal transfer</strong>: it is excluded from your income/expense totals and no client or
            vendor is created for it. Add every account you move money between — including your OD/CC account.
          </p>
        </div>
      </Card>

      <Card className="!p-0">
        {loading ? <Loading /> : (
          <Table
            columns={[
              { header: 'Label' }, { header: 'Account Number' }, { header: 'Holder Name' },
              { header: 'Bank' }, { header: 'Type' }, { header: 'Status' }, { header: '' },
            ]}
            rows={rows || []}
            empty="No own accounts yet. Add your OD and current accounts so internal transfers stop being counted as income."
            renderRow={(r) => (
              <>
                <td className="td font-semibold text-slate-800 dark:text-slate-100">{r.label || '—'}</td>
                <td className="td font-mono text-xs">{r.account_number}</td>
                <td className="td">{r.holder_name || '—'}</td>
                <td className="td">{r.bank_name || '—'}</td>
                <td className="td">{TYPE_LABEL[r.account_type] || r.account_type || '—'}</td>
                <td className="td">{r.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}</td>
                <td className="td text-right">
                  <div className="flex justify-end gap-1.5">
                    <button className="btn-ghost !py-1 !px-2.5 !text-xs" title="Edit" onClick={() => setEditing(r)}><Pencil size={14} /></button>
                    <button className="btn-ghost !py-1 !px-2.5 !text-xs !text-red-600" title="Remove" onClick={() => remove(r)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </>
            )}
          />
        )}
      </Card>

      {editing && (
        <OwnAccountModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch(); toast.success('Saved'); }}
        />
      )}
    </div>
  );
}

function OwnAccountModal({ row, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!row.id;
  const [form, setForm] = useState({
    account_number: row.account_number || '',
    holder_name: row.holder_name || '',
    bank_name: row.bank_name || '',
    account_type: row.account_type || 'current',
    label: row.label || '',
    is_active: row.is_active ?? true,
    notes: row.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.account_number.trim()) return toast.error('Account number is required');
    setSaving(true);
    try {
      if (isEdit) await api.patch(`/own-accounts/${row.id}`, form);
      else await api.post('/own-accounts', form);
      onSaved();
    } catch (err) { toast.error(apiError(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Own Account' : 'Add Own Account'}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Save'}</button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Account Number" required hint="Full number; a masked screenshot (XXXX1234) still matches by last digits">
          <input className="input font-mono" value={form.account_number} onChange={set('account_number')} />
        </Field>
        <Field label="Label" hint="e.g. IDBI OD, Current A/c">
          <input className="input" value={form.label} onChange={set('label')} />
        </Field>
        <Field label="Holder Name" hint="Name as it appears in bank narrations (helps name-based match)">
          <input className="input" value={form.holder_name} onChange={set('holder_name')} />
        </Field>
        <Field label="Bank">
          <input className="input" value={form.bank_name} onChange={set('bank_name')} />
        </Field>
        <Field label="Account Type">
          <select className="input" value={form.account_type} onChange={set('account_type')}>
            <option value="current">Current</option>
            <option value="od">OD / Cash Credit</option>
            <option value="savings">Savings</option>
            <option value="cc">Credit Card</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={form.is_active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </Field>
      </div>
      <div className="mt-4"><Field label="Notes"><textarea className="input min-h-[60px]" value={form.notes} onChange={set('notes')} /></Field></div>
    </Modal>
  );
}
