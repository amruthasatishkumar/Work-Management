import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2, X, MessageSquare, Upload, CheckCircle2, AlertCircle, ExternalLink, Loader } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { Badge, statusVariant, Button, Spinner } from '../components/ui';
import { Modal, FormField, Input, Select, Textarea } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Activity, Account, Opportunity, ActivityComment } from '../lib/types';

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

function CommentsPanel({ actId }: { actId: number }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: comments = [] } = useQuery<ActivityComment[]>({
    queryKey: queryKeys.activityComments.list(actId),
    queryFn: () => api.activityComments.list(actId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.activityComments.list(actId) });

  const create = useMutation({
    mutationFn: (content: string) => api.activityComments.create(actId, content),
    onSuccess: () => { invalidate(); setText(''); },
  });

  const del = useMutation({
    mutationFn: (commentId: number) => api.activityComments.delete(actId, commentId),
    onSuccess: invalidate,
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-4">
        <MessageSquare size={15} className="text-slate-400" />
        Comments ({comments.length})
      </h3>

      <div className="space-y-3 mb-4">
        {comments.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic">No comments yet. Add the first one below.</p>
        )}
        {comments.map(c => (
          <div key={c.id} className="flex items-start gap-2 group">
            <div className="flex-1 bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{formatDate(c.created_at)}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{c.content}</p>
            </div>
            <button
              onClick={() => del.mutate(c.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 mt-1 cursor-pointer transition-opacity"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={e => { e.preventDefault(); if (text.trim()) create.mutate(text.trim()); }}
        className="flex flex-col gap-2"
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (text.trim()) create.mutate(text.trim()); } }}
        />
        <div className="flex justify-end">
          <Button size="sm" type="submit" disabled={!text.trim() || create.isPending}>
            Add Comment
          </Button>
        </div>
      </form>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 dark:text-slate-200">{value}</span>
    </div>
  );
}

export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: act, isLoading } = useQuery<Activity>({
    queryKey: queryKeys.activities.detail(Number(id)),
    queryFn: () => api.activities.get(Number(id)),
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: queryKeys.accounts.all(),
    queryFn: () => api.accounts.list(),
  });

  const { data: opportunities = [] } = useQuery<Opportunity[]>({
    queryKey: queryKeys.opportunities.all(),
    queryFn: () => api.opportunities.list(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.activities.detail(Number(id)) });
    qc.invalidateQueries({ queryKey: ['activities'] });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const update = useMutation({
    mutationFn: (data: any) => api.activities.update(Number(id), data),
    onSuccess: () => { invalidate(); setEditing(false); },
  });

  const patchStatus = useMutation({
    mutationFn: (status: Activity['status']) => api.activities.patchKanban(Number(id), status, act?.position ?? 0),
    onSuccess: invalidate,
  });

  const [pushError, setPushError] = useState<string | null>(null);

  const deleteFromMsx = useMutation({
    mutationFn: async () => {
      setPushError(null);
      if (!act?.msx_id) return;
      const tokenData = await api.msx.tokenStatus();
      if (!tokenData.valid) throw new Error('No valid MSX token. Sign in first with: az login');
      const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
      const headers: Record<string, string> = {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      };

      // Verify current user is the creator before deleting
      const whoAmIRes = await fetch(`${D365_BASE}/WhoAmI`, { headers });
      if (!whoAmIRes.ok) throw new Error('Could not verify your identity. Try again.');
      const { UserId } = await whoAmIRes.json();
      const currentUserId = UserId.toLowerCase();

      const entityType = act.msx_entity_type ?? 'task';
      const checkRes = await fetch(
        `${D365_BASE}/${entityType}s(${act.msx_id})?$select=_createdby_value`,
        { headers }
      );
      if (!checkRes.ok) {
        if (checkRes.status === 404) {
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
    },
    onSuccess: () => { setPushError(null); invalidate(); },
    onError: (err: any) => setPushError(err.message),
  });

  const pushToMsx = useMutation({
    mutationFn: async () => {
      setPushError(null);
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

      const body: Record<string, any> = {
        subject: act!.purpose,
        scheduledend: act!.date + 'T00:00:00Z',
      };
      if (act!.notes) body.description = act!.notes;
      if (act!.opportunity_msx_id) {
        body['regardingobjectid_opportunity@odata.bind'] = `/opportunities(${act!.opportunity_msx_id})`;
      }

      let msxId = act!.msx_id;
      if (msxId) {
        // Update existing task in D365
        const patchRes = await fetch(`${D365_BASE}/tasks(${msxId})`, {
          method: 'PATCH', headers, body: JSON.stringify(body),
        });
        if (!patchRes.ok) {
          const err = await patchRes.json().catch(() => ({}));
          throw new Error(err?.error?.message ?? `D365 error: HTTP ${patchRes.status}`);
        }
      } else {
        // Create new task in D365
        const postRes = await fetch(`${D365_BASE}/tasks`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
        if (!postRes.ok) {
          const err = await postRes.json().catch(() => ({}));
          throw new Error(err?.error?.message ?? `D365 error: HTTP ${postRes.status}`);
        }
        const created = await postRes.json();
        msxId = created.activityid;
        await api.activities.saveMsxId(act!.id, msxId!);
      }
    },
    onSuccess: () => { setPushError(null); invalidate(); },
    onError: (err: any) => setPushError(err.message),
  });

  const del = useMutation({
    mutationFn: () => api.activities.delete(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities'] }); navigate('/activities'); },
  });

  if (isLoading) return <div className="p-8"><Spinner /></div>;
  if (!act) return <div className="p-8 text-slate-500">Activity not found.</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
        >
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-2">
          {act.msx_id ? (
            <button
              onClick={() => deleteFromMsx.mutate()}
              disabled={deleteFromMsx.isPending || pushToMsx.isPending}
              title="Click to remove from MSX"
              className="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {deleteFromMsx.isPending
                ? <Loader size={13} className="animate-spin" />
                : <><CheckCircle2 size={13} className="group-hover:hidden" /><Trash2 size={13} className="hidden group-hover:block" /></>}
              {deleteFromMsx.isPending ? 'Removing…' : 'Synced to MSX'}
            </button>
          ) : (
            <button
              onClick={() => pushToMsx.mutate()}
              disabled={pushToMsx.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50 cursor-pointer transition-colors"
            >
              <Upload size={13} />
              {pushToMsx.isPending ? 'Pushing…' : 'Push to MSX'}
            </button>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={13} /> Edit
          </Button>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </div>

      {/* MSX push error */}
      {pushError && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{pushError}</span>
          <button onClick={() => setPushError(null)} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer"><X size={13} /></button>
        </div>
      )}

      {/* Main card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge label={act.type} />
            <Badge label={act.status} variant={statusVariant(act.status)} />
            {act.due_date && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Due: {act.due_date}</span>}
            {act.completed_date && <span className="text-xs text-green-600 dark:text-green-400 font-medium">Completed: {act.completed_date}</span>}
          </div>
          {act.msx_id && (
            <button
              onClick={() => (window as any).electronAPI?.openExternal(`https://microsoftsales.crm.dynamics.com/main.aspx?etn=${act.msx_entity_type ?? 'task'}&pagetype=entityrecord&id=${act.msx_id}`)}
              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shrink-0"
              title="Open in MSX"
            >
              <ExternalLink size={16} />
            </button>
          )}
        </div>

        {/* Kanban status buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {(['To Do', 'In Progress', 'Completed', 'Blocked'] as Activity['status'][]).map(s => {
            const isActive = act.status === s;
            const colorMap: Record<string, string> = {
              'To Do':       isActive ? 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100 border-slate-400 dark:border-slate-400' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-slate-400',
              'In Progress': isActive ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-400 dark:border-blue-500' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-400',
              'Completed':   isActive ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-400 dark:border-emerald-500' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-emerald-400',
              'Blocked':     isActive ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-400 dark:border-red-500' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-red-400',
            };
            return (
              <button
                key={s}
                onClick={() => { if (!isActive) patchStatus.mutate(s); }}
                disabled={patchStatus.isPending}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${colorMap[s]}`}
              >
                {s}
              </button>
            );
          })}
        </div>

        <h1 className="text-lg font-semibold text-slate-900 dark:text-white leading-snug">{act.purpose}</h1>

        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700">
          <DetailRow label="Activity Date" value={act.date} />
          <DetailRow label="Account" value={
            <Link to={`/accounts/${act.account_id}`} className="text-blue-600 hover:underline">
              {act.account_name}
            </Link>
          } />
          <DetailRow label="Territory" value={act.territory_name} />
          <DetailRow label="Opportunity" value={act.opportunity_title ?? undefined} />
          <DetailRow label="Notes" value={act.notes ? <span className="whitespace-pre-wrap">{act.notes}</span> : undefined} />
        </div>
      </div>

      {/* Comments */}
      <CommentsPanel actId={act.id} />

      {editing && (
        <Modal title="Edit Activity" onClose={() => setEditing(false)} size="lg">
          <ActivityForm
            initial={act}
            accounts={accounts}
            opportunities={opportunities}
            onSubmit={d => update.mutate(d)}
            onClose={() => setEditing(false)}
            loading={update.isPending}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message="Delete this activity? This cannot be undone."
          onConfirm={() => del.mutate()}
          onCancel={() => setDeleting(false)}
          loading={del.isPending}
        />
      )}
    </div>
  );
}
