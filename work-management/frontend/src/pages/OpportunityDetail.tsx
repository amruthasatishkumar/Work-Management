import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Pencil, CheckSquare, Square, ExternalLink, X, BarChart3, Check } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { Button, Badge, statusVariant, Spinner } from '../components/ui';
import { Modal, FormField, Input, Select, Textarea } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CommentsPanel } from '../components/CommentsPanel';
import { useMsxLiveSync } from '../hooks/useMsxLiveSync';
import type { Opportunity, Activity } from '../lib/types';

const ACT_TYPES = ['Demo', 'Meeting', 'POC', 'Architecture Review', 'Follow up Meeting', 'Other'];
const ACT_STATUSES = ['To Do', 'In Progress', 'Completed', 'Blocked'];

// ─── Plan of Action inline editor ─────────────────────────────────────────────
function PlanOfActionPanel({ oppId, initial }: { oppId: number; initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNow = useCallback(async (value: string) => {
    await fetch(`/api/opportunities/${oppId}/plan-of-action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_of_action: value || null }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [oppId]);

  const handleChange = (value: string) => {
    setText(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNow(value), 800);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Plan of Action</h3>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <Check size={11} /> Saved
          </span>
        )}
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="Outline your plan of action for this opportunity…"
        rows={4}
        className="w-full text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 resize-y placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}

function ActivityForm({ initial, oppAccountId, oppId, onSubmit, onClose, loading }: {
  initial?: Partial<Activity>;
  oppAccountId: number;
  oppId: number;
  onSubmit: (d: any) => void;
  onClose: () => void;
  loading?: boolean;
}) {
  const [type, setType] = useState<Activity['type']>(initial?.type ?? 'Other');
  const [purpose, setPurpose] = useState(initial?.purpose ?? '');
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split('T')[0]);
  const [due_date, setDueDate] = useState(initial?.due_date ?? '');
  const [status, setStatus] = useState<Activity['status']>(initial?.status ?? 'To Do');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit({
          account_id: oppAccountId,
          opportunity_id: oppId,
          type, purpose, date,
          due_date: due_date || null,
          status,
          notes: notes || null,
        });
      }}
      className="flex flex-col gap-4"
    >
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
      <FormField label="Due Date">
        <Input type="date" value={due_date} onChange={e => setDueDate(e.target.value)} />
      </FormField>
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
        <Button type="submit" disabled={loading || !purpose.trim()}>
          {initial?.id ? 'Update' : 'Create Activity'}
        </Button>
      </div>
    </form>
  );
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const oppId = Number(id);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);

  const { data: opp, isLoading: oppLoading } = useQuery<Opportunity>({
    queryKey: queryKeys.opportunities.detail(oppId),
    queryFn: () => api.opportunities.get(oppId),
  });

  const actKey = queryKeys.activities.all({ opportunity_id: oppId });
  const { data: activities = [], isLoading: actLoading } = useQuery<Activity[]>({
    queryKey: actKey,
    queryFn: () => api.activities.list({ opportunity_id: oppId }),
    refetchInterval: 2 * 60 * 1000,
  });

  // Live-sync from MSX whenever this opp has been imported (has an msx_id)
  useMsxLiveSync(oppId, opp?.msx_id ?? null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['activities'] });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  const create = useMutation({
    mutationFn: api.activities.create,
    onSuccess: () => { invalidate(); setShowForm(false); },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.activities.update(id, data),
    onSuccess: () => { invalidate(); setEditing(null); },
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
      await qc.cancelQueries({ queryKey: actKey });
      const prev = qc.getQueryData(actKey);
      const newStatus = act.status === 'Completed' ? 'To Do' : 'Completed';
      qc.setQueryData(actKey, (old: any) =>
        Array.isArray(old) ? old.map((a: any) => a.id === act.id
          ? { ...a, status: newStatus, completed_date: newStatus === 'Completed' ? new Date().toISOString().split('T')[0] : null }
          : a
        ) : old
      );
      return { prev };
    },
    onError: (_err, _act, ctx: any) => qc.setQueryData(actKey, ctx?.prev),
    onSettled: () => invalidate(),
  });

  const del = useMutation({
    mutationFn: (actId: number) => api.activities.delete(actId),
    onMutate: async (actId) => {
      await qc.cancelQueries({ queryKey: actKey });
      const prev = qc.getQueryData(actKey);
      qc.setQueryData(actKey, (old: any) =>
        Array.isArray(old) ? old.filter((a: any) => a.id !== actId) : old
      );
      return { prev };
    },
    onError: (_err, _id, ctx: any) => qc.setQueryData(actKey, ctx?.prev),
    onSuccess: () => setDeleting(null),
    onSettled: () => invalidate(),
  });

  if (oppLoading) return <div className="p-8"><Spinner /></div>;
  if (!opp) return <div className="p-8 text-slate-500">Opportunity not found.</div>;

  const todoActs = activities.filter(a => a.status !== 'Completed');
  const doneActs = activities.filter(a => a.status === 'Completed');

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
      >
        <ArrowLeft size={15} /> Back
      </button>

      {/* Opportunity header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge label={opp.status} variant={statusVariant(opp.status)} />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white leading-snug">{opp.title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              <Link to={`/accounts/${opp.account_id}`} className="hover:text-blue-600 hover:underline">
                {opp.account_name}
              </Link>
              {opp.territory_name && <span className="text-slate-400"> · {opp.territory_name}</span>}
            </p>
          </div>
          {opp.link && (
            <a href={opp.link} target="_blank" rel="noopener noreferrer"
               className="text-slate-400 hover:text-blue-600 shrink-0" title="Open link">
              <ExternalLink size={16} />
            </a>
          )}
        </div>
        {(opp.description || opp.solution_play) && (
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 flex flex-col gap-1.5">
            {opp.solution_play && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">Solution Play:</span>{' '}{opp.solution_play}
              </p>
            )}
            {opp.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300">{opp.description}</p>
            )}
          </div>
        )}
        {opp.msx_id && (
          <button
            onClick={() => navigate(`/opportunities/${oppId}/milestones`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 cursor-pointer transition-colors w-fit"
          >
            <BarChart3 size={13} />
            View Milestones
          </button>
        )}
      </div>

      {/* Plan of Action */}
      <PlanOfActionPanel oppId={Number(oppId)} initial={opp.plan_of_action ?? ''} />

      {/* Activities */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Activities
            <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">{activities.length} total</span>
          </h2>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus size={13} /> Add Activity
          </Button>
        </div>

        {actLoading && <div className="p-6"><Spinner /></div>}

        {!actLoading && activities.length === 0 && (
          <p className="px-5 py-6 text-sm text-slate-400 dark:text-slate-500 italic">No activities yet. Add one above.</p>
        )}

        {!actLoading && activities.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {/* Open activities first */}
            {todoActs.map(act => (
              <ActivityRow
                key={act.id}
                act={act}
                onToggle={() => toggle.mutate(act)}
                onEdit={() => setEditing(act)}
                onDelete={() => setDeleting(act)}
              />
            ))}
            {/* Completed activities */}
            {doneActs.map(act => (
              <ActivityRow
                key={act.id}
                act={act}
                onToggle={() => toggle.mutate(act)}
                onEdit={() => setEditing(act)}
                onDelete={() => setDeleting(act)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-4">
        <CommentsPanel oppId={opp.id} oppMsxId={opp.msx_id ?? null} defaultOpen={true} />
      </div>

      {/* Modals */}
      {showForm && (
        <Modal title="Add Activity" onClose={() => setShowForm(false)}>
          <ActivityForm
            oppAccountId={opp.account_id}
            oppId={opp.id}
            onSubmit={d => create.mutate(d)}
            onClose={() => setShowForm(false)}
            loading={create.isPending}
          />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Activity" onClose={() => setEditing(null)}>
          <ActivityForm
            initial={editing}
            oppAccountId={opp.account_id}
            oppId={opp.id}
            onSubmit={d => update.mutate({ id: editing.id, data: d })}
            onClose={() => setEditing(null)}
            loading={update.isPending}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          message={`Delete activity "${deleting.purpose}"?`}
          onConfirm={() => del.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          loading={del.isPending}
        />
      )}
    </div>
  );
}

function ActivityRow({ act, onToggle, onEdit, onDelete }: {
  act: Activity;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = act.status === 'Completed';
  return (
    <div className="flex items-center gap-3 px-5 py-3 group hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
      <button onClick={onToggle} className="shrink-0 text-slate-400 hover:text-blue-600 cursor-pointer transition-colors">
        {done
          ? <CheckSquare size={16} className="text-emerald-500" />
          : <Square size={16} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Link
            to={`/activities/${act.id}`}
            className={`text-sm font-medium hover:text-blue-600 hover:underline ${done ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}
          >
            {act.purpose}
          </Link>
          {act.msx_id && (
            <button
              onClick={() => (window as any).electronAPI?.openExternal(`https://microsoftsales.crm.dynamics.com/main.aspx?etn=${act.msx_entity_type ?? 'task'}&pagetype=entityrecord&id=${act.msx_id}`)}
              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shrink-0"
              title="Open in MSX"
            >
              <ExternalLink size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <Badge label={act.type} />
          <Badge label={act.status} variant={statusVariant(act.status)} />
          <span className="text-xs text-slate-400 dark:text-slate-500">{act.date}</span>
          {act.due_date && <span className="text-xs text-amber-600 dark:text-amber-400">Due: {act.due_date}</span>}
          {act.completed_date && <span className="text-xs text-green-600 dark:text-green-400">Done: {act.completed_date}</span>}
        </div>
        {act.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{act.notes}</p>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit} className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"><Pencil size={13} /></button>
        <button onClick={onDelete} className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"><X size={13} /></button>
      </div>
    </div>
  );
}
