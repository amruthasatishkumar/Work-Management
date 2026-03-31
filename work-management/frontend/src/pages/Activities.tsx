import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Upload, CheckCircle2, ExternalLink, Loader } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, Button, Badge, statusVariant, Spinner, EmptyState } from '../components/ui';
import { Modal, FormField, Input, Select, Textarea } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Activity, Account, Opportunity } from '../lib/types';

const ACT_TYPES = ['Demo', 'Meeting', 'POC', 'Architecture Review', 'Follow up Meeting', 'Other'];
const ACT_STATUSES = ['To Do', 'In Progress', 'Completed', 'Blocked'];

function ActivityForm({ initial, accounts, opportunities, onSubmit, onClose, loading }: {
  initial?: Partial<Activity>; accounts: Account[]; opportunities: Opportunity[];
  onSubmit: (d: any) => void; onClose: () => void; loading?: boolean;
}) {
  const [account_id, setAccountId] = useState(initial?.account_id ? String(initial.account_id) : '');
  const [opportunity_id, setOppId] = useState(initial?.opportunity_id ? String(initial.opportunity_id) : '');
  const [type, setType] = useState<Activity['type']>(initial?.type ?? 'Meeting');
  const [purpose, setPurpose] = useState(initial?.purpose ?? '');
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split('T')[0]);
  const [due_date, setDueDate] = useState(initial?.due_date ?? '');
  const [status, setStatus] = useState<Activity['status']>(initial?.status ?? 'To Do');
  const [completed_date, setCompletedDate] = useState(initial?.completed_date ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const filteredOpps = opportunities.filter(o => !account_id || o.account_id === Number(account_id));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ account_id: Number(account_id), opportunity_id: opportunity_id ? Number(opportunity_id) : null, type, purpose, date, due_date: due_date || null, status, completed_date: completed_date || null, notes: notes || null }); }}
          className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Type" required>
          <Select value={type} onChange={e => setType(e.target.value as Activity['type'])}>
            {ACT_TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
        </FormField>
        <FormField label="Activity Date" required>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Due Date" hint="Optional — when this activity is due">
          <Input type="date" value={due_date} onChange={e => setDueDate(e.target.value)} />
        </FormField>
        <FormField label="Completed Date" hint="Set when activity is completed">
          <Input type="date" value={completed_date} onChange={e => setCompletedDate(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Account" required>
        <Select value={account_id} onChange={e => { setAccountId(e.target.value); setOppId(''); }} required>
          <option value="">Select account...</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.territory_name})</option>)}
        </Select>
      </FormField>
      <FormField label="Purpose" required hint="What is this activity for?">
        <Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Showcase Azure AI capabilities" required />
      </FormField>
      <FormField label="Status">
        <Select value={status} onChange={e => setStatus(e.target.value as Activity['status'])}>
          {ACT_STATUSES.map(s => <option key={s}>{s}</option>)}
        </Select>
      </FormField>
      <FormField label="Linked Opportunity" hint="Optional — link to a specific opportunity">
        <Select value={opportunity_id} onChange={e => setOppId(e.target.value)}>
          <option value="">None (standalone activity)</option>
          {filteredOpps.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
        </Select>
      </FormField>
      <FormField label="Notes">
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details..." />
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={loading || !account_id}>{initial?.id ? 'Update' : 'Create'}</Button>
      </div>
    </form>
  );
}

export default function Activities() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOpp, setFilterOpp] = useState('');
  const [hideCompleted, setHideCompleted] = useState(() => searchParams.get('exclude_completed') === '1');
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: queryKeys.accounts.all(),
    queryFn: () => api.accounts.list(),
  });

  const { data: opportunities = [] } = useQuery<Opportunity[]>({
    queryKey: queryKeys.opportunities.all(),
    queryFn: () => api.opportunities.list(),
  });

  const { data = [], isLoading } = useQuery<Activity[]>({
    queryKey: queryKeys.activities.all({ type: filterType || undefined, status: filterStatus || undefined, opportunity_id: filterOpp ? Number(filterOpp) : undefined }),
    queryFn: () => api.activities.list({ type: filterType || undefined, status: filterStatus || undefined, opportunity_id: filterOpp ? Number(filterOpp) : undefined }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['activities'] });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    qc.invalidateQueries({ queryKey: ['accounts'] });
    qc.invalidateQueries({ queryKey: ['opp-next-steps'] });
  };

  const create = useMutation({ mutationFn: api.activities.create, onSuccess: () => { invalidate(); setShowForm(false); } });
  const update = useMutation({ mutationFn: ({ id, data }: any) => api.activities.update(id, data), onSuccess: () => { invalidate(); setEditing(null); } });

  async function deleteFromMsx(act: Activity) {
    if (!act.msx_id) return;
    setPushingId(act.id);
    setPushError(null);
    try {
      const tokenData = await api.msx.tokenStatus();
      if (!tokenData.valid) throw new Error('No valid MSX token. Sign in first with: az login');
      const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
      const headers = {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      };

      // Resolve the current user's ID from WhoAmI
      const whoAmIRes = await fetch(`${D365_BASE}/WhoAmI`, { headers });
      if (!whoAmIRes.ok) throw new Error('Could not verify your identity. Try again.');
      const { UserId } = await whoAmIRes.json();
      const currentUserId = UserId.toLowerCase();

      // Fetch the D365 record to verify current user is the creator
      const entityType = act.msx_entity_type ?? 'task';
      const checkRes = await fetch(
        `${D365_BASE}/${entityType}s(${act.msx_id})?$select=_createdby_value`,
        { headers }
      );
      if (!checkRes.ok) {
        if (checkRes.status === 404) {
          // Already gone from MSX — just clear locally
          await api.activities.saveMsxId(act.id, null);
          invalidate();
          return;
        }
        const e = await checkRes.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${checkRes.status}`);
      }
      const record = await checkRes.json();
      const createdById = (record._createdby_value ?? '').toLowerCase();
      if (createdById && createdById !== currentUserId) {
        throw new Error('You can only delete activities you created in MSX.');
      }

      const res = await fetch(`${D365_BASE}/${entityType}s(${act.msx_id})`, { method: 'DELETE', headers });
      if (!res.ok && res.status !== 404) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }
      await api.activities.saveMsxId(act.id, null);
      invalidate();
    } catch (err: any) {
      setPushError(err.message);
    } finally {
      setPushingId(null);
    }
  }

  async function pushToMsx(act: Activity) {
    setPushError(null);
    setPushingId(act.id);
    try {
      const tokenData = await api.msx.tokenStatus();
      if (!tokenData.valid) throw new Error('No valid MSX token. Sign in first with: az login');
      const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
      const headers: Record<string, string> = {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'return=representation',
      };
      const body: Record<string, any> = { subject: act.purpose, scheduledend: act.date + 'T00:00:00Z' };
      if (act.notes) body.description = act.notes;
      if (act.opportunity_msx_id) body['regardingobjectid_opportunity@odata.bind'] = `/opportunities(${act.opportunity_msx_id})`;

      if (act.msx_id) {
        const res = await fetch(`${D365_BASE}/tasks(${act.msx_id})`, { method: 'PATCH', headers, body: JSON.stringify(body) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message ?? `HTTP ${res.status}`); }
      } else {
        const res = await fetch(`${D365_BASE}/tasks`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message ?? `HTTP ${res.status}`); }
        const created = await res.json();
        await api.activities.saveMsxId(act.id, created.activityid);
      }
      invalidate();
    } catch (err: any) {
      setPushError(err.message);
    } finally {
      setPushingId(null);
    }
  }
  const del = useMutation({
    mutationFn: api.activities.delete,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['activities'] });
      const snapshot = qc.getQueriesData({ queryKey: ['activities'] });
      qc.setQueriesData({ queryKey: ['activities'] }, (old: any) =>
        Array.isArray(old) ? old.filter((a: any) => a.id !== id) : old
      );
      return { snapshot };
    },
    onError: (_err, _id, ctx: any) => {
      ctx?.snapshot?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSuccess: () => setDeleting(null),
    onSettled: () => invalidate(),
  });

  const displayed = hideCompleted ? data.filter(a => a.status !== 'Completed') : data;

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle="All customer activities across territories"
        action={<Button onClick={() => setShowForm(true)}><Plus size={14} /> Add Activity</Button>}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <Select value={filterType} onChange={e => setFilterType(e.target.value)} className="max-w-xs">
          <option value="">All types</option>
          {ACT_TYPES.map(t => <option key={t}>{t}</option>)}
        </Select>
        <Select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setHideCompleted(false); }} className="max-w-xs">
          <option value="">All statuses</option>
          {ACT_STATUSES.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select value={filterOpp} onChange={e => setFilterOpp(e.target.value)} className="max-w-xs">
          <option value="">All opportunities</option>
          {opportunities.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
        </Select>
        {hideCompleted && (
          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
            Hiding completed
            <button onClick={() => setHideCompleted(false)} className="hover:text-amber-900 leading-none">&times;</button>
          </span>
        )}
      </div>

      {isLoading && <Spinner />}
      {!isLoading && displayed.length === 0 && (
        <EmptyState title="No activities found" description="Add your first activity or adjust filters." />
      )}

      <div className="p-6 space-y-3">
        {displayed.map((act) => (
          <div key={act.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={act.type} />
                  <Badge label={act.status} variant={statusVariant(act.status)} />
                  <span className="text-xs text-slate-400 dark:text-slate-500">{act.date}</span>
                  {act.due_date && <span className="text-xs text-amber-600 dark:text-amber-400">Due: {act.due_date}</span>}
                  {act.completed_date && <span className="text-xs text-green-600 dark:text-green-400">Completed: {act.completed_date}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Link to={`/activities/${act.id}`} className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">{act.purpose}</Link>
                  {act.msx_id && (
                    <button
                      onClick={() => (window as any).electronAPI?.openExternal(`https://microsoftsales.crm.dynamics.com/main.aspx?etn=${act.msx_entity_type ?? 'task'}&pagetype=entityrecord&id=${act.msx_id}`)}
                      className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shrink-0"
                      title="Open in MSX"
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <Link to={`/accounts/${act.account_id}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">{act.account_name}</Link>
                  {' · '}{act.territory_name}
                </p>
                {act.opportunity_title && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">↳ {act.opportunity_title}</p>}
                {act.notes && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{act.notes}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <button
                  onClick={() => act.msx_id ? deleteFromMsx(act) : pushToMsx(act)}
                  disabled={pushingId === act.id}
                  className={`group flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer disabled:opacity-40 ${
                    act.msx_id
                      ? 'border-emerald-500 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400'
                      : 'border-blue-400 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                  }`}
                >
                  {pushingId === act.id
                    ? <Loader size={12} className="animate-spin" />
                    : act.msx_id
                      ? <><CheckCircle2 size={12} className="group-hover:hidden" /><Trash2 size={12} className="hidden group-hover:block" /></>
                      : <Upload size={12} />
                  }
                  {pushingId === act.id ? 'Working…' : act.msx_id ? 'Synced to MSX' : 'Push to MSX'}
                </button>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setEditing(act)} className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"><Pencil size={14} /></button>
                  <button onClick={() => setDeleting(act)} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && <Modal title="New Activity" onClose={() => setShowForm(false)} size="lg">
        <ActivityForm accounts={accounts} opportunities={opportunities} onSubmit={d => create.mutate(d)} onClose={() => setShowForm(false)} loading={create.isPending} />
      </Modal>}
      {editing && <Modal title="Edit Activity" onClose={() => setEditing(null)} size="lg">
        <ActivityForm initial={editing} accounts={accounts} opportunities={opportunities} onSubmit={d => update.mutate({ id: editing.id, data: d })} onClose={() => setEditing(null)} loading={update.isPending} />
      </Modal>}
      {deleting && <ConfirmDialog message="Delete this activity?" onConfirm={() => del.mutate(deleting.id)} onCancel={() => setDeleting(null)} loading={del.isPending} />}
      {pushError && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-red-600 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">
          <span className="flex-1">{pushError}</span>
          <button onClick={() => setPushError(null)} className="text-white/70 hover:text-white cursor-pointer">&times;</button>
        </div>
      )}
    </div>
  );
}
