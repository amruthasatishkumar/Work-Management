import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, RefreshCw, ExternalLink, Users, UserMinus, Plus,
  Loader2, AlertCircle, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { Spinner } from '../components/ui';
import type { Opportunity } from '../lib/types';

const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
const MILESTONE_TEAM_TEMPLATE_ID = '316e4735-9e83-eb11-a812-0022481e1be0';
const FV = '@OData.Community.Display.V1.FormattedValue';

const MILESTONE_SELECT = [
  'msp_engagementmilestoneid',
  'msp_milestonenumber',
  'msp_name',
  '_msp_workloadlkid_value',
  'msp_commitmentrecommendation',
  'msp_milestonecategory',
  'msp_monthlyuse',
  'msp_milestonedate',
  'msp_milestonestatus',
  '_ownerid_value',
].join(',');

const TASK_CATEGORIES = [
  { label: 'Technical Close/Win Plan', value: 606820005 },
  { label: 'Architecture Design Session', value: 861980004 },
  { label: 'Blocker Escalation', value: 861980006 },
  { label: 'Briefing', value: 861980008 },
  { label: 'Consumption Plan', value: 861980007 },
  { label: 'Demo', value: 861980002 },
  { label: 'PoC/Pilot', value: 861980005 },
  { label: 'Workshop', value: 861980001 },
];

function fv(obj: any, field: string): string {
  return obj?.[`${field}${FV}`] ?? obj?.[field] ?? '—';
}

function formatCurrency(val: any): string {
  const n = Number(val);
  if (!val || isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US');
}

function formatDate(val: string | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

// ── Create Task Modal ─────────────────────────────────────────────────────────

function CreateTaskModal({
  milestoneName,
  onSubmit,
  onClose,
  loading,
}: {
  milestoneName: string;
  onSubmit: (category: { label: string; value: number }, dueDate: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [category, setCategory] = useState(TASK_CATEGORIES[0]);
  const [dueDate, setDueDate] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-md shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Create Task</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Milestone: <span className="font-medium text-slate-700 dark:text-slate-200">{milestoneName}</span>
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Task Category
            </label>
            <select
              value={category.value}
              onChange={e => setCategory(TASK_CATEGORIES.find(c => c.value === Number(e.target.value))!)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {TASK_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Due Date <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(category, dueDate)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OpportunityMilestones() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const oppId = Number(id);

  const { data: opp } = useQuery<Opportunity>({
    queryKey: queryKeys.opportunities.detail(oppId),
    queryFn: () => api.opportunities.get(oppId),
  });

  const [milestones, setMilestones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teamStatus, setTeamStatus] = useState<Record<string, boolean>>({});
  const [actionStatus, setActionStatus] = useState<Record<string, string | null>>({});
  const [taskModal, setTaskModal] = useState<{ milestoneId: string; milestoneName: string } | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const cachedUserIdRef = useRef<string | null>(null);
  const cachedUserNameRef = useRef<string | null>(null);

  const getHeaders = useCallback(async (): Promise<{
    headers: Record<string, string>;
    userId: string;
    userName: string;
  } | null> => {
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
      cachedUserNameRef.current = tokenData.userId ?? '';
    }
    return { headers, userId: cachedUserIdRef.current!, userName: cachedUserNameRef.current ?? '' };
  }, []);

  const checkTeamMembership = useCallback(async (
    headers: Record<string, string>,
    userId: string,
    ms: any[],
  ) => {
    try {
      const fetchXml = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="true" no-lock="true">
        <entity name="team">
          <attribute name="teamid"/>
          <attribute name="regardingobjectid"/>
          <filter type="and">
            <condition attribute="teamtype" operator="eq" value="1"/>
            <condition attribute="teamtemplateid" operator="eq" value="{${MILESTONE_TEAM_TEMPLATE_ID}}"/>
          </filter>
          <link-entity name="teammembership" from="teamid" to="teamid" link-type="inner" alias="tm">
            <filter type="and">
              <condition attribute="systemuserid" operator="eq" value="${userId}"/>
            </filter>
          </link-entity>
        </entity>
      </fetch>`;
      const r = await fetch(`${D365_BASE}/teams?fetchXml=${encodeURIComponent(fetchXml)}`, { headers });
      if (!r.ok) return;
      const j = await r.json();
      const memberIds = new Set<string>(
        (j.value ?? [])
          .map((t: any) => String(t._regardingobjectid_value ?? '').toLowerCase().replace(/[{}]/g, ''))
          .filter(Boolean),
      );
      const map: Record<string, boolean> = {};
      ms.forEach(m => {
        map[m.msp_engagementmilestoneid] = memberIds.has(
          m.msp_engagementmilestoneid.toLowerCase().replace(/[{}]/g, ''),
        );
      });
      setTeamStatus(map);
    } catch { /* silent */ }
  }, []);

  const loadMilestones = useCallback(async () => {
    if (!opp?.msx_id) return;
    setLoading(true);
    setError(null);
    try {
      const ctx = await getHeaders();
      if (!ctx) {
        setError("No valid MSX token. Run 'az login' in a terminal to sign in.");
        setLoading(false);
        return;
      }
      const { headers, userId } = ctx;
      const cleanId = opp.msx_id.replace(/[{}]/g, '');
      const r = await fetch(
        `${D365_BASE}/msp_engagementmilestones?$filter=_msp_opportunityid_value eq '${cleanId}'&$select=${MILESTONE_SELECT}&$orderby=msp_milestonedate`,
        { headers },
      );
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${r.status}`);
      }
      const json = await r.json();
      const loaded: any[] = json.value ?? [];
      setMilestones(loaded);

      if (loaded.length > 0) {
        checkTeamMembership(headers, userId, loaded);

        // Save to local DB for AI assistant (fire-and-forget)
        const mapped = loaded.map(m => ({
          msxId: m.msp_engagementmilestoneid,
          milestoneNumber: m.msp_milestonenumber ?? null,
          name: m.msp_name ?? null,
          workload: m[`_msp_workloadlkid_value${FV}`] ?? null,
          commitment: m[`msp_commitmentrecommendation${FV}`] ?? m.msp_commitmentrecommendation ?? null,
          category: m[`msp_milestonecategory${FV}`] ?? m.msp_milestonecategory ?? null,
          monthlyUse: m.msp_monthlyuse ?? null,
          milestoneDate: m.msp_milestonedate ? m.msp_milestonedate.split('T')[0] : null,
          status: m[`msp_milestonestatus${FV}`] ?? m.msp_milestonestatus ?? null,
          owner: m[`_ownerid_value${FV}`] ?? null,
        }));
        api.msx.refreshOpp({ localOppId: oppId, comments: [], activities: [], milestones: mapped })
          .catch(() => {});
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [opp?.msx_id, oppId, getHeaders, checkTeamMembership]);

  useEffect(() => {
    if (opp?.msx_id) loadMilestones();
  }, [opp?.msx_id, loadMilestones]);

  const toggleTeam = async (milestoneId: string) => {
    const isMember = teamStatus[milestoneId];
    setActionStatus(p => ({ ...p, [milestoneId]: isMember ? 'leaving' : 'joining' }));
    try {
      const ctx = await getHeaders();
      if (!ctx) throw new Error('No valid MSX token.');
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
              msp_engagementmilestoneid: milestoneId,
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
      setTeamStatus(p => ({ ...p, [milestoneId]: !isMember }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionStatus(p => ({ ...p, [milestoneId]: null }));
    }
  };

  const createTask = async (category: { label: string; value: number }, dueDate: string) => {
    if (!taskModal) return;
    setTaskLoading(true);
    try {
      const ctx = await getHeaders();
      if (!ctx) throw new Error('No valid MSX token.');
      const { headers, userId, userName } = ctx;
      const initials = userName
        ? userName.split(' ').map((n: string) => n.charAt(0).toUpperCase()).join('')
        : '';
      const taskData: any = {
        subject: `SE HoK - ${category.label} - ${taskModal.milestoneName} - ${initials}`,
        msp_taskcategory: category.value,
        scheduleddurationminutes: 60,
        prioritycode: 1,
        'regardingobjectid_msp_engagementmilestone@odata.bind': `/msp_engagementmilestones(${taskModal.milestoneId})`,
        'ownerid@odata.bind': `/systemusers(${userId})`,
      };
      if (dueDate) taskData.scheduledend = `${dueDate}T00:00:00Z`;
      const r = await fetch(`${D365_BASE}/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(taskData),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${r.status}`);
      }
      setTaskModal(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTaskLoading(false);
    }
  };

  const statusOptions = Array.from(
    new Set(milestones.map(m => m[`msp_milestonestatus${FV}`] ?? String(m.msp_milestonestatus ?? ''))),
  ).filter(Boolean).sort();

  const displayed = milestones.filter(m => {
    const name = (m.msp_name ?? '').toLowerCase();
    const status = m[`msp_milestonestatus${FV}`] ?? String(m.msp_milestonestatus ?? '');
    return (
      (!nameFilter || name.includes(nameFilter.toLowerCase())) &&
      (!statusFilter || status === statusFilter)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer shrink-0"
          >
            <ArrowLeft size={15} />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-none truncate">
              Milestones{opp ? `: ${opp.title}` : ''}
            </h1>
            {milestones.length > 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {displayed.length === milestones.length
                  ? `${milestones.length} milestone${milestones.length !== 1 ? 's' : ''}`
                  : `${displayed.length} of ${milestones.length}`}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={loadMilestones}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Not-synced warning */}
      {opp && !opp.msx_id && (
        <div className="m-6 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle size={15} />
          This opportunity has not been synced from MSX. Milestones are only available for MSX-linked opportunities.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
            <X size={13} />
          </button>
        </div>
      )}

      {opp?.msx_id && (
        <div className="p-6 space-y-4">
          {/* Filters */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">
                Filter:
              </span>
              <input
                type="text"
                placeholder="Search by name…"
                value={nameFilter}
                onChange={e => setNameFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">All Statuses</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {(nameFilter || statusFilter) && (
                <button
                  onClick={() => { setNameFilter(''); setStatusFilter(''); }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-12 flex items-center justify-center">
              <Spinner />
            </div>
          )}

          {/* Empty state */}
          {!loading && milestones.length === 0 && !error && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-12 text-center">
              <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                No milestones found for this opportunity.
              </p>
            </div>
          )}

          {/* Table */}
          {!loading && displayed.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                      {[
                        'Milestone ID', 'Name', 'Customer Commitment',
                        'Category', 'Est. Monthly Usage', 'Est. Date', 'Status', 'Actions',
                      ].map(col => (
                        <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {displayed.map(m => {
                      const mid = m.msp_engagementmilestoneid;
                      const isMember = teamStatus[mid] ?? false;
                      const acting = actionStatus[mid];
                      const isActing = acting === 'joining' || acting === 'leaving';
                      const statusLabel = m[`msp_milestonestatus${FV}`] ?? String(m.msp_milestonestatus ?? '');
                      const sl = statusLabel.toLowerCase();
                      const statusCls = sl.includes('track')
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : sl.includes('risk') || sl.includes('behind')
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
                      return (
                        <tr key={mid} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">
                            {m.msp_milestonenumber ?? '—'}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-xs">
                            <span className="line-clamp-2">{m.msp_name ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {fv(m, 'msp_commitmentrecommendation')}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {fv(m, 'msp_milestonecategory')}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {formatCurrency(m.msp_monthlyuse)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {formatDate(m.msp_milestonedate)}
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            {statusLabel
                              ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                              : <span className="text-slate-400">—</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {/* Join / Leave Team */}
                              <button
                                onClick={() => toggleTeam(mid)}
                                disabled={isActing}
                                title={isMember ? 'Leave Milestone Team' : 'Join Milestone Team'}
                                className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-40 ${
                                  isMember
                                    ? 'text-emerald-600 dark:text-emerald-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500'
                                    : 'text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600'
                                }`}
                              >
                                {isActing
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : isMember ? <UserMinus size={14} /> : <Users size={14} />
                                }
                              </button>
                              {/* Create Task */}
                              <button
                                onClick={() => setTaskModal({ milestoneId: mid, milestoneName: m.msp_name ?? '' })}
                                title="Create Task"
                                className="p-1.5 rounded-md text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors cursor-pointer"
                              >
                                <Plus size={14} />
                              </button>
                              {/* Open in MSX */}
                              <button
                                onClick={() =>
                                  (window as any).electronAPI?.openExternal(
                                    `https://microsoftsales.crm.dynamics.com/main.aspx?etn=msp_engagementmilestone&pagetype=entityrecord&id=${mid}`,
                                  )
                                }
                                title="Open in MSX"
                                className="p-1.5 rounded-md text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors cursor-pointer"
                              >
                                <ExternalLink size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Task Modal */}
      {taskModal && (
        <CreateTaskModal
          milestoneName={taskModal.milestoneName}
          onSubmit={createTask}
          onClose={() => setTaskModal(null)}
          loading={taskLoading}
        />
      )}
    </div>
  );
}
