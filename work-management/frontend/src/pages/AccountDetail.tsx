import { useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Pencil, Trash2, ExternalLink, Check } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { Button, Badge, statusVariant, Spinner } from '../components/ui';
import { Modal, FormField, Input, Select, Textarea } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Account, Opportunity, Activity } from '../lib/types';

const OPP_STATUSES = ['Active', 'In Progress', 'Committed', 'Not Active'];

// ─── Plan of Action inline editor ─────────────────────────────────────────────
function PlanOfActionPanel({ accountId, initial }: { accountId: number; initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNow = useCallback(async (value: string) => {
    await fetch(`/api/accounts/${accountId}/plan-of-action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_of_action: value || null }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [accountId]);

  const handleChange = (value: string) => {
    setText(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNow(value), 800);
  };

  return (
    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
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
        placeholder="Outline your plan of action for this account…"
        rows={4}
        className="w-full text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 resize-y placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
const ACT_TYPES = ['Demo', 'POC', 'Meeting', 'Architecture Review', 'Other', 'Task', 'Follow Up'];
const ACT_STATUSES = ['Planned', 'In Progress', 'Completed', 'Cancelled'];

function OpportunityForm({ initial, accountId, onSubmit, onClose, loading }: {
  initial?: Partial<Opportunity>; accountId: number;
  onSubmit: (d: any) => void; onClose: () => void; loading?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [link, setLink] = useState(initial?.link ?? '');
  const [status, setStatus] = useState<Opportunity['status']>(initial?.status ?? 'Active');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ account_id: accountId, title, description: description || null, link: link || null, status }); }} className="flex flex-col gap-4">
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
        <Button type="submit" disabled={loading}>{initial?.id ? 'Update' : 'Create'}</Button>
      </div>
    </form>
  );
}

function ActivityForm({ initial, accountId, opportunities, onSubmit, onClose, loading }: {
  initial?: Partial<Activity>; accountId: number; opportunities: Opportunity[];
  onSubmit: (d: any) => void; onClose: () => void; loading?: boolean;
}) {
  const [opportunity_id, setOppId] = useState(initial?.opportunity_id ? String(initial.opportunity_id) : '');
  const [type, setType] = useState<Activity['type']>(initial?.type ?? 'Meeting');
  const [purpose, setPurpose] = useState(initial?.purpose ?? '');
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<Activity['status']>(initial?.status ?? 'To Do');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ account_id: accountId, opportunity_id: opportunity_id ? Number(opportunity_id) : null, type, purpose, date, status, notes: notes || null }); }} className="flex flex-col gap-4">
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
          {opportunities.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
        </Select>
      </FormField>
      <FormField label="Notes">
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details..." />
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={loading}>{initial?.id ? 'Update' : 'Create'}</Button>
      </div>
    </form>
  );
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const accountId = Number(id);
  const qc = useQueryClient();

  const [showOppForm, setShowOppForm] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);
  const [deletingOpp, setDeletingOpp] = useState<Opportunity | null>(null);
  const [showActForm, setShowActForm] = useState(false);
  const [editingAct, setEditingAct] = useState<Activity | null>(null);
  const [deletingAct, setDeletingAct] = useState<Activity | null>(null);
  const [filterOppId, setFilterOppId] = useState<number | null>(null);

  const { data: account, isLoading: loadingAccount } = useQuery<Account>({
    queryKey: queryKeys.accounts.detail(accountId),
    queryFn: () => api.accounts.get(accountId),
  });

  const { data: opps = [], isLoading: loadingOpps } = useQuery<Opportunity[]>({
    queryKey: queryKeys.opportunities.all({ account_id: accountId }),
    queryFn: () => api.opportunities.list({ account_id: accountId }),
  });

  const { data: activities = [], isLoading: loadingActs } = useQuery<Activity[]>({
    queryKey: queryKeys.activities.all({ account_id: accountId }),
    queryFn: () => api.activities.list({ account_id: accountId }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: ['activities'] });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  const createOpp = useMutation({ mutationFn: api.opportunities.create, onSuccess: () => { invalidateAll(); setShowOppForm(false); } });
  const updateOpp = useMutation({ mutationFn: ({ id, data }: any) => api.opportunities.update(id, data), onSuccess: () => { invalidateAll(); setEditingOpp(null); } });
  const deleteOpp = useMutation({ mutationFn: api.opportunities.delete, onSuccess: () => { invalidateAll(); setDeletingOpp(null); } });
  const createAct = useMutation({ mutationFn: api.activities.create, onSuccess: () => { invalidateAll(); setShowActForm(false); } });
  const updateAct = useMutation({ mutationFn: ({ id, data }: any) => api.activities.update(id, data), onSuccess: () => { invalidateAll(); setEditingAct(null); } });
  const deleteAct = useMutation({ mutationFn: api.activities.delete, onSuccess: () => { invalidateAll(); setDeletingAct(null); } });

  if (loadingAccount) return <Spinner />;

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <Link to="/accounts" className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 mb-2">
          <ArrowLeft size={14} /> Back to Accounts
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{account?.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{account?.territory_name}</p>
          </div>
          {account?.website && (
            <a href={account.website} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
              <ExternalLink size={14} /> Website
            </a>
          )}
        </div>
        {account?.notes && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{account.notes}</p>}
      </div>

      {/* Plan of Action */}
      {account && <PlanOfActionPanel accountId={accountId} initial={account.plan_of_action ?? ''} />}

      <div className="p-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Opportunities */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Opportunities ({opps.length})</h3>
            <Button size="sm" onClick={() => setShowOppForm(true)}><Plus size={13} /> Add</Button>
          </div>
          {loadingOpps ? <Spinner /> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {opps.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500 px-4 py-6 text-center">No opportunities yet</p>}
              {opps.map((opp) => (
                <div
                  key={opp.id}
                  className={`px-4 py-3 cursor-pointer transition-colors ${
                    filterOppId === opp.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                  onClick={() => setFilterOppId(prev => prev === opp.id ? null : opp.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link to={`/opportunities/${opp.id}`} className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">{opp.title}</Link>
                        {opp.link && <a href={opp.link} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600"><ExternalLink size={12} /></a>}
                      </div>
                      {opp.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{opp.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge label={opp.status} variant={statusVariant(opp.status)} />
                      <button onClick={() => setEditingOpp(opp)} className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => setDeletingOpp(opp)} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Activities */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Activities ({filterOppId ? activities.filter(a => a.opportunity_id === filterOppId).length : activities.length})
              </h3>
              {filterOppId && (
                <button
                  onClick={() => setFilterOppId(null)}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-full px-2 py-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer"
                >
                  {opps.find(o => o.id === filterOppId)?.title.split('|')[0].trim() ?? 'Filtered'} &times;
                </button>
              )}
            </div>
            <Button size="sm" onClick={() => setShowActForm(true)}><Plus size={13} /> Add</Button>
          </div>
          {loadingActs ? <Spinner /> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {activities.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500 px-4 py-6 text-center">No activities yet</p>}
              {(filterOppId ? activities.filter(a => a.opportunity_id === filterOppId) : activities).map((act) => (
                <div key={act.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={act.type} />
                        <Badge label={act.status} variant={statusVariant(act.status)} />
                        <span className="text-xs text-slate-400 dark:text-slate-500">{act.date}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Link to={`/activities/${act.id}`} className="text-sm text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">{act.purpose}</Link>
                        {act.msx_id && (
                          <button
                            onClick={e => { e.stopPropagation(); (window as any).electronAPI?.openExternal(`https://microsoftsales.crm.dynamics.com/main.aspx?etn=${act.msx_entity_type ?? 'task'}&pagetype=entityrecord&id=${act.msx_id}`); }}
                            className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shrink-0"
                            title="Open in MSX"
                          >
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </div>
                      {act.opportunity_title && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">↳ {act.opportunity_title}</p>}
                      {act.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{act.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditingAct(act)} className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => setDeletingAct(act)} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Opportunity modals */}
      {showOppForm && <Modal title="New Opportunity" onClose={() => setShowOppForm(false)} size="lg">
        <OpportunityForm accountId={accountId} onSubmit={d => createOpp.mutate(d)} onClose={() => setShowOppForm(false)} loading={createOpp.isPending} />
      </Modal>}
      {editingOpp && <Modal title="Edit Opportunity" onClose={() => setEditingOpp(null)} size="lg">
        <OpportunityForm initial={editingOpp} accountId={accountId} onSubmit={d => updateOpp.mutate({ id: editingOpp.id, data: d })} onClose={() => setEditingOpp(null)} loading={updateOpp.isPending} />
      </Modal>}
      {deletingOpp && <ConfirmDialog message={`Delete opportunity "${deletingOpp.title}"?`} onConfirm={() => deleteOpp.mutate(deletingOpp.id)} onCancel={() => setDeletingOpp(null)} loading={deleteOpp.isPending} />}

      {/* Activity modals */}
      {showActForm && <Modal title="New Activity" onClose={() => setShowActForm(false)} size="lg">
        <ActivityForm accountId={accountId} opportunities={opps} onSubmit={d => createAct.mutate(d)} onClose={() => setShowActForm(false)} loading={createAct.isPending} />
      </Modal>}
      {editingAct && <Modal title="Edit Activity" onClose={() => setEditingAct(null)} size="lg">
        <ActivityForm initial={editingAct} accountId={accountId} opportunities={opps} onSubmit={d => updateAct.mutate({ id: editingAct.id, data: d })} onClose={() => setEditingAct(null)} loading={updateAct.isPending} />
      </Modal>}
      {deletingAct && <ConfirmDialog message={`Delete this activity?`} onConfirm={() => deleteAct.mutate(deletingAct.id)} onCancel={() => setDeletingAct(null)} loading={deleteAct.isPending} />}
    </div>
  );
}
