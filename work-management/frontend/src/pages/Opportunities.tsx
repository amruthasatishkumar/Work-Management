import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ExternalLink, X, CheckSquare, Square, ArrowRight } from 'lucide-react';
import { CommentsPanel } from '../components/CommentsPanel';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, Button, Badge, statusVariant, Spinner, EmptyState } from '../components/ui';
import { Modal, FormField, Input, Select, Textarea } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Opportunity, Account, Territory, Activity } from '../lib/types';

const OPP_STATUSES = ['Active', 'In Progress', 'Committed', 'Not Active'];
const ACT_TYPES = ['Demo', 'Meeting', 'POC', 'Architecture Review', 'Follow up Meeting', 'Other'];
const ACT_STATUSES = ['To Do', 'In Progress', 'Completed', 'Blocked'];

// â”€â”€â”€ Opportunity create/edit form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function OpportunityForm({ initial, accounts, onSubmit, onClose, loading }: {
  initial?: Partial<Opportunity>; accounts: Account[];
  onSubmit: (d: any) => void; onClose: () => void; loading?: boolean;
}) {
  const [account_id, setAccountId] = useState(initial?.account_id ? String(initial.account_id) : '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [link, setLink] = useState(initial?.link ?? '');
  const [status, setStatus] = useState<Opportunity['status']>(initial?.status ?? 'Active');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ account_id: Number(account_id), title, description: description || null, link: link || null, status });
      }}
      className="flex flex-col gap-4"
    >
      <FormField label="Account" required>
        <Select value={account_id} onChange={e => setAccountId(e.target.value)} required>
          <option value="">Select account...</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.territory_name})</option>)}
        </Select>
      </FormField>
      <FormField label="Opportunity Title" required>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Azure Migration Project" required />
      </FormField>
      <FormField label="Description">
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this opportunity about?" />
      </FormField>
      <FormField label="Link" hint="Reference link (SharePoint, email, doc, etc.)">
        <Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." type="url" />
      </FormField>
      <FormField label="Status">
        <Select value={status} onChange={e => setStatus(e.target.value as Opportunity['status'])}>
          {OPP_STATUSES.map(s => <option key={s}>{s}</option>)}
        </Select>
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={loading || !account_id}>{initial?.id ? 'Update' : 'Create'}</Button>
      </div>
    </form>
  );
}

// â”€â”€â”€ Add-to-activity modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AddActivityModal({ opp, prefillPurpose, onClose }: {
  opp: Opportunity; prefillPurpose: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<Activity['type']>('Meeting');
  const [purpose, setPurpose] = useState(prefillPurpose);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<Activity['status']>('To Do');
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: api.activities.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
  });

  return (
    <Modal title="Add to Activities" onClose={onClose} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            account_id: opp.account_id,
            opportunity_id: opp.id,
            type, purpose, date, status,
            notes: notes || null,
          });
        }}
        className="flex flex-col gap-4"
      >
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
          Linked to: <span className="font-semibold">{opp.title}</span> Â· {opp.account_name}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Type" required>
            <Select value={type} onChange={e => setType(e.target.value as Activity['type'])}>
              {ACT_TYPES.map(t => <option key={t}>{t}</option>)}
            </Select>
          </FormField>
          <FormField label="Date" required>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </FormField>
        </div>
        <FormField label="Purpose" required>
          <Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="What is this activity for?" required />
        </FormField>
        <FormField label="Status">
          <Select value={status} onChange={e => setStatus(e.target.value as Activity['status'])}>
            {ACT_STATUSES.map(s => <option key={s}>{s}</option>)}
          </Select>
        </FormField>
        <FormField label="Notes">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details..." />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>Create Activity</Button>
        </div>
      </form>
    </Modal>
  );
}

// â”€â”€â”€ Comments sub-panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// CommentsPanel is a shared component — see src/components/CommentsPanel.tsx

// â”€â”€â”€ Next Steps sub-panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NextStepsPanel({ opp }: { opp: Opportunity }) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState('');

  const { data: steps = [] } = useQuery<Activity[]>({
    queryKey: queryKeys.activities.all({ opportunity_id: opp.id }),
    queryFn: () => api.activities.list({ opportunity_id: opp.id }),
  });

  const oppActKey = queryKeys.activities.all({ opportunity_id: opp.id });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['activities'] });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  const create = useMutation({
    mutationFn: (title: string) => api.activities.create({
      account_id: opp.account_id,
      opportunity_id: opp.id,
      type: 'Other',
      purpose: title,
      date: new Date().toISOString().split('T')[0],
      status: 'To Do',
    }),
    onMutate: async (title) => {
      await qc.cancelQueries({ queryKey: oppActKey });
      const prev = qc.getQueryData(oppActKey);
      qc.setQueryData(oppActKey, (old: any) => [
        ...(Array.isArray(old) ? old : []),
        { id: -Date.now(), account_id: opp.account_id, opportunity_id: opp.id, type: 'Other',
          purpose: title, date: new Date().toISOString().split('T')[0], status: 'To Do',
          completed_date: null, notes: null },
      ]);
      return { prev };
    },
    onError: (_err, _title, ctx: any) => qc.setQueryData(oppActKey, ctx?.prev),
    onSuccess: () => setNewTitle(''),
    onSettled: () => invalidate(),
  });

  const toggle = useMutation({
    mutationFn: (act: Activity) => api.activities.update(act.id, {
      account_id: act.account_id,
      opportunity_id: act.opportunity_id,
      type: act.type,
      purpose: act.purpose,
      date: act.date,
      status: act.status === 'Completed' ? 'To Do' : 'Completed',
    }),
    onMutate: async (act) => {
      await qc.cancelQueries({ queryKey: oppActKey });
      const prev = qc.getQueryData(oppActKey);
      const newStatus = act.status === 'Completed' ? 'To Do' : 'Completed';
      qc.setQueryData(oppActKey, (old: any) =>
        Array.isArray(old) ? old.map((a: any) => a.id === act.id
          ? { ...a, status: newStatus, completed_date: newStatus === 'Completed' ? new Date().toISOString().split('T')[0] : null }
          : a
        ) : old
      );
      return { prev };
    },
    onError: (_err, _act, ctx: any) => qc.setQueryData(oppActKey, ctx?.prev),
    onSettled: () => invalidate(),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.activities.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: oppActKey });
      const prev = qc.getQueryData(oppActKey);
      qc.setQueryData(oppActKey, (old: any) =>
        Array.isArray(old) ? old.filter((a: any) => a.id !== id) : old
      );
      return { prev };
    },
    onError: (_err, _id, ctx: any) => qc.setQueryData(oppActKey, ctx?.prev),
    onSettled: () => invalidate(),
  });

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 mt-3 pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Activities</p>
        <Link
          to={`/opportunities/${opp.id}`}
          className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
        >
          View all <ArrowRight size={11} />
        </Link>
      </div>

      {steps.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic mb-2">No next steps yet.</p>
      )}

      <div className="space-y-1.5 mb-3">
        {steps.map(step => (
          <div key={step.id} className="flex items-center gap-2 group">
            <button
              onClick={() => toggle.mutate(step)}
              className="text-slate-400 hover:text-blue-600 cursor-pointer shrink-0 transition-colors"
            >
              {step.status === 'Completed'
                ? <CheckSquare size={15} className="text-emerald-500" />
                : <Square size={15} />}
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Link
                to={`/opportunities/${opp.id}`}
                className={`text-sm hover:text-blue-600 hover:underline truncate ${step.status === 'Completed' ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}
              >
                {step.purpose}
              </Link>
              {step.status === 'Completed' && step.completed_date && (
                <span className="text-xs text-slate-400 shrink-0">
                  Done {new Date(step.completed_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            <button
              onClick={() => del.mutate(step.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 cursor-pointer transition-opacity"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (newTitle.trim()) create.mutate(newTitle.trim()); }}
        className="flex gap-2"
      >
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Add a next step..."
          className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-md text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button size="sm" type="submit" disabled={!newTitle.trim() || create.isPending}>
          <Plus size={13} /> Add
        </Button>
      </form>
    </div>
  );
}

// â”€â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function Opportunities() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [deleting, setDeleting] = useState<Opportunity | null>(null);

  // Cascading filters — stored in URL so back-navigation restores them
  const filterTerritory = searchParams.get('territory') ?? '';
  const filterAccount   = searchParams.get('account')   ?? '';
  const filterStatus    = searchParams.get('status')    ?? '';

  const setFilter = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  const { data: territories = [] } = useQuery<Territory[]>({
    queryKey: queryKeys.territories.all,
    queryFn: api.territories.list,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: queryKeys.accounts.all(filterTerritory ? Number(filterTerritory) : undefined),
    queryFn: () => api.accounts.list(filterTerritory ? Number(filterTerritory) : undefined),
  });

  // All accounts (for "add opportunity" form selector)
  const { data: allAccounts = [] } = useQuery<Account[]>({
    queryKey: queryKeys.accounts.all(),
    queryFn: () => api.accounts.list(),
  });

  const filterParams = {
    territory_id: filterTerritory ? Number(filterTerritory) : undefined,
    account_id: filterAccount ? Number(filterAccount) : undefined,
    status: filterStatus || undefined,
  };

  const { data = [], isLoading } = useQuery<Opportunity[]>({
    queryKey: queryKeys.opportunities.all(filterParams),
    queryFn: () => api.opportunities.list(filterParams),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  const create = useMutation({ mutationFn: api.opportunities.create, onSuccess: () => { invalidate(); setShowForm(false); } });
  const update = useMutation({ mutationFn: ({ id, data }: any) => api.opportunities.update(id, data), onSuccess: () => { invalidate(); setEditing(null); } });
  const del = useMutation({ mutationFn: api.opportunities.delete, onSuccess: () => { invalidate(); setDeleting(null); } });

  const handleTerritoryChange = (val: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) next.set('territory', val); else next.delete('territory');
      next.delete('account'); // reset account when territory changes
      return next;
    }, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Opportunities"
        subtitle="All opportunities across your territories"
        action={<Button onClick={() => setShowForm(true)}><Plus size={14} /> Add Opportunity</Button>}
      />

      {/* Cascading filters */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <Select value={filterTerritory} onChange={e => handleTerritoryChange(e.target.value)} className="!w-44">
          <option value="">All territories</option>
          {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select
          value={filterAccount}
          onChange={e => setFilter('account', e.target.value)}
          disabled={!filterTerritory}
          className="!w-48"
        >
          <option value="">{filterTerritory ? 'All accounts' : 'Select territory first'}</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select value={filterStatus} onChange={e => setFilter('status', e.target.value)} className="!w-36">
          <option value="">All statuses</option>
          {OPP_STATUSES.map(s => <option key={s}>{s}</option>)}
        </Select>
        {(filterTerritory || filterAccount || filterStatus) && (
          <button
            onClick={() => setSearchParams({}, { replace: true })}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {isLoading && <Spinner />}
      {!isLoading && data.length === 0 && (
        <EmptyState title="No opportunities found" description="Add your first opportunity or adjust filters." />
      )}

      <div className="p-6 space-y-4">
        {data.map((opp) => (
          <div key={opp.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-sm transition-shadow">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <Link to={`/opportunities/${opp.id}`} className="hover:text-blue-600 hover:underline">{opp.title}</Link>
                  </h3>
                  {opp.link && (
                    <a href={opp.link} target="_blank" rel="noopener noreferrer"
                       className="text-slate-400 hover:text-blue-600" title="Open link">
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <Badge label={opp.status} variant={statusVariant(opp.status)} />
                  {opp.solution_play && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                      {opp.solution_play}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  <Link to={`/accounts/${opp.account_id}`} className="hover:text-blue-600 hover:underline">{opp.account_name}</Link>
                  {' · '}{opp.territory_name}
                </p>
                {opp.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{opp.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(opp)} className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"><Pencil size={14} /></button>
                <button onClick={() => setDeleting(opp)} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 size={14} /></button>
              </div>
            </div>

            {/* Comments */}
            <CommentsPanel oppId={opp.id} oppMsxId={opp.msx_id ?? null} />

            {/* Next Steps */}
            <NextStepsPanel opp={opp} />
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title="New Opportunity" onClose={() => setShowForm(false)} size="lg">
          <OpportunityForm accounts={allAccounts} onSubmit={d => create.mutate(d)} onClose={() => setShowForm(false)} loading={create.isPending} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Opportunity" onClose={() => setEditing(null)} size="lg">
          <OpportunityForm initial={editing} accounts={allAccounts} onSubmit={d => update.mutate({ id: editing.id, data: d })} onClose={() => setEditing(null)} loading={update.isPending} />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          message={`Delete opportunity "${deleting.title}"?`}
          onConfirm={() => del.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          loading={del.isPending}
        />
      )}
    </div>
  );
}
