import { useState, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
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

// ── Expanded activities sub-row ───────────────────────────────────────────────
function ExpandedActivities({ milestoneId }: { milestoneId: number }) {
  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ['milestone-activities', milestoneId],
    queryFn: () => api.milestones.getActivities(milestoneId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-8 py-3 text-xs text-slate-400 dark:text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Loading activities…
      </div>
    );
  }
  if (activities.length === 0) {
    return (
      <div className="px-8 py-3 text-xs text-slate-400 dark:text-slate-500 italic">
        No activities linked to this milestone yet. Re-import from MSX to sync.
      </div>
    );
  }
  return (
    <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/40">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {['Subject / Purpose', 'Type', 'Date', 'Due Date', 'Status'].map(h => (
              <th key={h} className="px-3 pb-2 pt-1 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {activities.map(act => (
            <tr key={act.id} className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
              <td className="px-3 py-2 text-slate-800 dark:text-slate-100 max-w-xs">
                <Link
                  to={`/activities/${act.id}`}
                  className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline line-clamp-2"
                >
                  {act.purpose}
                </Link>
              </td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{act.type}</td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(act.date)}</td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{act.due_date ? formatDate(act.due_date) : '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <Badge label={act.status} variant={statusVariant(act.status)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Milestones() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
                            {m.msx_id && (
                              <button
                                onClick={() =>
                                  (window as any).electronAPI?.openExternal(
                                    `https://microsoftsales.crm.dynamics.com/main.aspx?etn=msp_engagementmilestone&pagetype=entityrecord&id=${m.msx_id}`,
                                  )
                                }
                                title="Open in MSX"
                                className="p-1.5 rounded-md text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors cursor-pointer"
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
                                <ExpandedActivities milestoneId={m.id} />
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
