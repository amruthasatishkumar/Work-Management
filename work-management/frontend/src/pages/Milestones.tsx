import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ChevronRight, ChevronDown, Loader2, Plus, Upload, CheckCircle2, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { type Milestone, type Activity } from '../lib/types';
import { PageHeader, Spinner, EmptyState, Badge, statusVariant } from '../components/ui';

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function formatCurrency(val: number | null): string {
  if (val == null) return '—';
  return '$' + Number(val).toLocaleString('en-US');
}

function statusBadgeClass(status: string | null): string {
  const sl = (status ?? '').toLowerCase();
  if (sl.includes('track')) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
  if (sl.includes('risk') || sl.includes('behind')) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
  return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
}

const COLUMNS = [
  'Name', 'Opportunity', 'Account',
  'Customer Commitment', 'Category', 'Est. Monthly Usage', 'Est. Date', 'Status', 'Owner', 'Actions',
];

const ACT_TYPES = ['Demo', 'Meeting', 'POC', 'Architecture Review', 'Follow up Meeting', 'Other'];
const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
const MILESTONE_TEAM_TEMPLATE_ID = '316e4735-9e83-eb11-a812-0022481e1be0';

// ── Expanded activities sub-row ───────────────────────────────────────────────
function ExpandedActivities({ milestone, initialFormOpen }: { milestone: Milestone; initialFormOpen?: boolean }) {
  const qc = useQueryClient();
  const queryKey = ['milestone-activities', milestone.id];

  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey,
    queryFn: () => api.milestones.getActivities(milestone.id),
  });

  // ── Add activity inline form state ────────────────────────────────────────
  const [showForm, setShowForm] = useState(initialFormOpen ?? false);
  const [purpose, setPurpose] = useState('');
  const [type, setType] = useState('Other');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.activities.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['activities'] });
      setPurpose(''); setType('Other'); setDate(new Date().toISOString().split('T')[0]);
      setShowForm(false); setFormError(null);
    },
    onError: (err: any) => setFormError(err.message),
  });

  const handleAdd = () => {
    if (!purpose.trim()) { setFormError('Purpose is required'); return; }
    if (!milestone.account_id) { setFormError('Account not resolved for this milestone'); return; }
    createMutation.mutate({
      account_id:     milestone.account_id,
      opportunity_id: milestone.opportunity_id,
      milestone_id:   milestone.id,
      type,
      purpose:        purpose.trim(),
      date,
      status:         'To Do',
    });
  };

  // ── Push to MSX ───────────────────────────────────────────────────────────
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  async function pushToMsx(act: Activity) {
    setPushingId(act.id); setPushError(null);
    try {
      const tokenData = await api.msx.tokenStatus();
      if (!tokenData.valid) throw new Error('No valid MSX token. Run "az login" first.');
      const headers: Record<string, string> = {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'return=representation',
      };
      const body: Record<string, any> = {
        subject: act.purpose,
        scheduledend: act.date + 'T00:00:00Z',
      };
      // Bind to the milestone as the regarding object (preferred over opportunity)
      if (milestone.msx_id) {
        body['regardingobjectid_msp_engagementmilestone@odata.bind'] =
          `/msp_engagementmilestones(${milestone.msx_id})`;
      } else if (act.opportunity_msx_id) {
        body['regardingobjectid_opportunity@odata.bind'] =
          `/opportunities(${act.opportunity_msx_id})`;
      }
      if (act.notes) body.description = act.notes;

      if (act.msx_id) {
        const res = await fetch(`${D365_BASE}/tasks(${act.msx_id})`, { method: 'PATCH', headers, body: JSON.stringify(body) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message ?? `HTTP ${res.status}`); }
      } else {
        const res = await fetch(`${D365_BASE}/tasks`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message ?? `HTTP ${res.status}`); }
        const created = await res.json();
        await api.activities.saveMsxId(act.id, created.activityid);
      }
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['activities'] });
    } catch (err: any) {
      setPushError(err.message);
    } finally {
      setPushingId(null);
    }
  }

  async function deleteFromMsx(act: Activity) {
    if (!act.msx_id) return;
    setPushingId(act.id); setPushError(null);
    try {
      const tokenData = await api.msx.tokenStatus();
      if (!tokenData.valid) throw new Error('No valid MSX token.');
      const headers: Record<string, string> = {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      };
      const res = await fetch(`${D365_BASE}/tasks(${act.msx_id})`, { method: 'DELETE', headers });
      if (!res.ok && res.status !== 404) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message ?? `HTTP ${res.status}`); }
      await api.activities.saveMsxId(act.id, null);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['activities'] });
    } catch (err: any) {
      setPushError(err.message);
    } finally {
      setPushingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-8 py-3 text-xs text-slate-400 dark:text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Loading activities…
      </div>
    );
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700">
      {/* Activities table */}
      {activities.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['Subject / Purpose', 'Type', 'Date', 'Due Date', 'Status', ''].map(h => (
                <th key={h} className="px-4 pb-2 pt-3 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {activities.map(act => (
              <tr key={act.id} className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-2 text-slate-800 dark:text-slate-100 max-w-xs">
                  <Link to={`/activities/${act.id}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline line-clamp-2">
                    {act.purpose}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{act.type}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(act.date)}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{act.due_date ? formatDate(act.due_date) : '—'}</td>
                <td className="px-4 py-2 whitespace-nowrap"><Badge label={act.status} variant={statusVariant(act.status)} /></td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <button
                    onClick={() => act.msx_id ? deleteFromMsx(act) : pushToMsx(act)}
                    disabled={pushingId === act.id}
                    title={act.msx_id ? 'Synced to MSX — click to remove' : 'Push to MSX'}
                    className={`group flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                      act.msx_id
                        ? 'border-emerald-500 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400'
                        : 'border-blue-400 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                    }`}
                  >
                    {pushingId === act.id
                      ? <Loader2 size={11} className="animate-spin" />
                      : act.msx_id
                        ? <><CheckCircle2 size={11} className="group-hover:hidden" /><Trash2 size={11} className="hidden group-hover:block" /></>
                        : <Upload size={11} />
                    }
                    <span>{pushingId === act.id ? '…' : act.msx_id ? 'Synced' : 'Push'}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !showForm && (
          <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 italic">
            No activities linked yet. Re-import from MSX or add one below.
          </p>
        )
      )}

      {/* Push error */}
      {pushError && (
        <p className="mx-4 mt-1 text-xs text-red-500 dark:text-red-400">{pushError}</p>
      )}

      {/* Inline add form */}
      {showForm ? (
        <div className="flex items-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-slate-500 dark:text-slate-400">Purpose *</label>
            <input
              autoFocus
              type="text"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowForm(false); }}
              placeholder="e.g. Architecture review session"
              className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 w-72"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-slate-500 dark:text-slate-400">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {ACT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-slate-500 dark:text-slate-400">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={createMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {createMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Add
          </button>
          <button
            onClick={() => { setShowForm(false); setFormError(null); }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            Cancel
          </button>
          {formError && <p className="text-xs text-red-500 dark:text-red-400">{formError}</p>}
        </div>
      ) : (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            <Plus size={12} /> Add activity
          </button>
        </div>
      )}
    </div>
  );
}

export default function Milestones() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [addFormIds, setAddFormIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Plus button: expand + open add-activity form
  const openAddActivity = (id: number) => {
    setExpandedIds(prev => { const s = new Set(prev); s.add(id); return s; });
    setAddFormIds(prev => { const s = new Set(prev); s.add(id); return s; });
  };

  // ── D365 team toggle ────────────────────────────────────────────────────────
  const [teamStatus, setTeamStatus] = useState<Record<string, boolean>>({});
  const [actionStatus, setActionStatus] = useState<Record<string, string | null>>({});
  const [teamError, setTeamError] = useState<string | null>(null);
  const cachedUserIdRef = useRef<string | null>(null);

  const getHeaders = useCallback(async (): Promise<{ headers: Record<string, string>; userId: string } | null> => {
    const tokenData = await api.msx.tokenStatus().catch(() => null);
    if (!tokenData?.valid) return null;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokenData.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    };
    if (!cachedUserIdRef.current) {
      const r = await fetch(`${D365_BASE}/WhoAmI`, { headers });
      if (!r.ok) return null;
      const { UserId } = await r.json();
      cachedUserIdRef.current = UserId.toLowerCase().replace(/[{}]/g, '');
    }
    return { headers, userId: cachedUserIdRef.current! };
  }, []);

  const toggleTeam = async (m: Milestone) => {
    if (!m.msx_id) return;
    const mid = m.msx_id;
    const isMember = teamStatus[mid] ?? (m.on_team === 1);
    setActionStatus(p => ({ ...p, [mid]: isMember ? 'leaving' : 'joining' }));
    setTeamError(null);
    try {
      const ctx = await getHeaders();
      if (!ctx) throw new Error('No valid MSX token. Run "az login" first.');
      const { headers, userId } = ctx;
      const action = isMember ? 'RemoveUserFromRecordTeam' : 'AddUserToRecordTeam';
      const r = await fetch(
        `${D365_BASE}/systemusers(${userId})/Microsoft.Dynamics.CRM.${action}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            Record: {
              '@odata.type': 'Microsoft.Dynamics.CRM.msp_engagementmilestone',
              msp_engagementmilestoneid: mid,
            },
            TeamTemplate: {
              '@odata.type': 'Microsoft.Dynamics.CRM.teamtemplate',
              teamtemplateid: MILESTONE_TEAM_TEMPLATE_ID,
            },
          }),
        },
      );
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${r.status}`);
      }
      const newVal = !isMember;
      setTeamStatus(p => ({ ...p, [mid]: newVal }));
      // Also sync to local DB
      api.milestones.setOnTeam(m.id, newVal ? 1 : 0).catch(() => {});
    } catch (err: any) {
      setTeamError(err.message);
    } finally {
      setActionStatus(p => ({ ...p, [mid]: null }));
    }
  };

  const nameFilter   = searchParams.get('name')    ?? '';
  const statusFilter = searchParams.get('status')  ?? '';
  const accountFilter = searchParams.get('account') ?? '';
  const oppFilter    = searchParams.get('opp')     ?? '';
  const ownerFilter  = searchParams.get('owner')   ?? '';

  const [nameInput, setNameInput] = useState(nameFilter);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFilter = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  const { data: milestones = [], isLoading } = useQuery({
    queryKey: queryKeys.milestones.all(),
    queryFn: () => api.milestones.list(),
  });

  // Seed teamStatus from local DB on_team when milestones first load
  useEffect(() => {
    if ((milestones as Milestone[]).length === 0) return;
    setTeamStatus(prev => {
      const next = { ...prev };
      (milestones as Milestone[]).forEach(m => {
        if (m.msx_id && !(m.msx_id in next)) {
          next[m.msx_id] = m.on_team === 1;
        }
      });
      return next;
    });
  }, [milestones]);

  const statusOptions = useMemo(() =>
    Array.from(new Set((milestones as Milestone[]).map(m => m.status ?? '').filter(Boolean))).sort(),
    [milestones],
  );
  const accountOptions = useMemo(() =>
    Array.from(new Set((milestones as Milestone[]).map(m => m.account_name ?? '').filter(Boolean))).sort(),
    [milestones],
  );
  const oppOptions = useMemo(() =>
    Array.from(new Set((milestones as Milestone[]).map(m => m.opportunity_title ?? '').filter(Boolean))).sort(),
    [milestones],
  );
  const ownerOptions = useMemo(() =>
    Array.from(new Set((milestones as Milestone[]).map(m => m.owner ?? '').filter(Boolean))).sort(),
    [milestones],
  );

  const hasFilter = !!(nameFilter || statusFilter || accountFilter || oppFilter || ownerFilter);


  const displayed = useMemo(() =>
    (milestones as Milestone[]).filter(m => {
      const nameMatch = !nameFilter || (m.name ?? '').toLowerCase().includes(nameFilter.toLowerCase());
      const statusMatch = !statusFilter || m.status === statusFilter;
      const accountMatch = !accountFilter || m.account_name === accountFilter;
      const oppMatch = !oppFilter || m.opportunity_title === oppFilter;
      const ownerMatch = !ownerFilter || m.owner === ownerFilter;
      return nameMatch && statusMatch && accountMatch && oppMatch && ownerMatch;
    }),
    [milestones, nameFilter, statusFilter, accountFilter, oppFilter, ownerFilter],
  );

  return (
    <div>
      <PageHeader
        title="Milestones"
        subtitle={`${milestones.length} milestone${milestones.length !== 1 ? 's' : ''} across your opportunities`}
      />

      <div className="p-6 space-y-4">
        {isLoading ? (
          <Spinner />
        ) : milestones.length === 0 ? (
          <EmptyState
            title="No milestones found"
            description="Import opportunities from MSX to see their milestones here"
          />
        ) : (
          <>
            {/* Filter bar */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">
                  Filter:
                </span>
                <input
                  type="text"
                  placeholder="Search by name…"
                  value={nameInput}
                  onChange={e => {
                    const v = e.target.value;
                    setNameInput(v);
                    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
                    nameDebounceRef.current = setTimeout(() => setFilter('name', v), 200);
                  }}
                  className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 w-44"
                />
                <select
                  value={accountFilter}
                  onChange={e => setFilter('account', e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">All Accounts</option>
                  {accountOptions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select
                  value={oppFilter}
                  onChange={e => setFilter('opp', e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[200px] truncate"
                >
                  <option value="">All Opportunities</option>
                  {oppOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select
                  value={statusFilter}
                  onChange={e => setFilter('status', e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">All Statuses</option>
                  {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  value={ownerFilter}
                  onChange={e => setFilter('owner', e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">All Owners</option>
                  {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {hasFilter && (
                  <button
                    onClick={() => { setNameInput(''); setSearchParams({}, { replace: true }); }}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
                  >
                    Clear
                  </button>
                )}
                {hasFilter && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto shrink-0">
                    {displayed.length} of {milestones.length}
                  </span>
                )}
              </div>
            </div>

            {/* Team error */}
            {teamError && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-sm text-red-700 dark:text-red-300">
                <span className="flex-1">{teamError}</span>
                <button onClick={() => setTeamError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">✕</button>
              </div>
            )}

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                      <th className="w-8 px-2 py-3" />
                      {COLUMNS.map(col => (
                        <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {displayed.map(m => {
                      const isExpanded = expandedIds.has(m.id);
                      return (
                        <>
                          <tr
                            key={m.id}
                            className={`hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors ${isExpanded ? 'bg-slate-50 dark:bg-slate-700/30' : ''}`}
                          >
                            <td className="w-8 px-2 py-3">
                              <button
                                onClick={() => toggleExpand(m.id)}
                                className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer"
                                title={isExpanded ? 'Collapse activities' : 'Expand activities'}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-xs">
                          {m.msx_id ? (
                            <Link
                              to={`/opportunities/${m.opportunity_id}/milestones/${m.msx_id}/tasks`}
                              className="line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                            >
                              {m.name ?? '—'}
                            </Link>
                          ) : (
                            <span className="line-clamp-2">{m.name ?? '—'}</span>
                          )}
                          {m.milestone_number && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{m.milestone_number}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-[200px]">
                          <Link
                            to={`/opportunities/${m.opportunity_id}`}
                            className="text-left hover:text-blue-600 dark:hover:text-blue-400 hover:underline line-clamp-2 transition-colors"
                          >
                            {m.opportunity_title ?? '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {m.account_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {m.commitment ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {m.category ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatCurrency(m.monthly_use)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatDate(m.milestone_date)}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {m.status
                            ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(m.status)}`}>{m.status}</span>
                            : <span className="text-slate-400">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {m.owner ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* 1. Toggle on_team */}
                            {(() => {
                              const isMember = m.msx_id ? (teamStatus[m.msx_id] ?? (m.on_team === 1)) : (m.on_team === 1);
                              const isActing = m.msx_id ? (actionStatus[m.msx_id] === 'joining' || actionStatus[m.msx_id] === 'leaving') : false;
                              return (
                                <button
                                  onClick={() => m.msx_id ? toggleTeam(m) : undefined}
                                  disabled={isActing || !m.msx_id}
                                  title={isMember ? 'On milestone team — click to remove' : 'Add to milestone team'}
                                  className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
                                    isMember
                                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500'
                                      : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
                                  }`}
                                >
                                  {isActing ? (<Loader2 size={14} className="animate-spin" />) : isMember ? (<CheckCircle2 size={14} />) : (<Users size={14} />)}
                                </button>
                              );
                            })()}
                            {/* 2. Add activity (expand row + open form) */}
                            <button
                              onClick={() => openAddActivity(m.id)}
                              title="Add activity"
                              className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-600 dark:hover:text-green-400 transition-colors cursor-pointer"
                            >
                              <Plus size={14} />
                            </button>
                            {/* 3. MSX link */}
                            {m.msx_id && (
                              <button
                                onClick={() =>
                                  (window as any).electronAPI?.openExternal(
                                    `https://microsoftsales.crm.dynamics.com/main.aspx?etn=msp_engagementmilestone&pagetype=entityrecord&id=${m.msx_id}`,
                                  )
                                }
                                title="Open in MSX"
                                className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors cursor-pointer"
                              >
                                <ExternalLink size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                          {isExpanded && (
                            <tr key={`${m.id}-activities`} className="border-b border-slate-200 dark:border-slate-700">
                              <td colSpan={COLUMNS.length + 1} className="p-0">
                                <ExpandedActivities
                                  milestone={m}
                                  initialFormOpen={addFormIds.has(m.id)}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
