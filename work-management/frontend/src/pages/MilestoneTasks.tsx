import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, statusVariant, Spinner } from '../components/ui';
import type { Activity } from '../lib/types';

function formatDate(val: string | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

export default function MilestoneTasks() {
  const { id, milestoneMsxId } = useParams<{ id: string; milestoneMsxId: string }>();
  const navigate = useNavigate();
  const oppId = Number(id);

  // Find the local milestone record by msx_id + opportunity_id
  const { data: milestones = [], isLoading: milestoneLoading, isFetching: milestonesFetching, refetch: refetchMilestones } = useQuery<any[]>({
    queryKey: ['milestones', { opportunity_id: oppId, msx_id: milestoneMsxId }],
    queryFn: () => api.milestones.list({ opportunity_id: oppId, msx_id: milestoneMsxId }),
    enabled: !!oppId && !!milestoneMsxId,
  });

  const milestone = milestones[0] ?? null;

  // Fetch activities linked to this milestone
  const { data: activities = [], isLoading: activitiesLoading, isFetching: activitiesFetching, refetch: refetchActivities } = useQuery<Activity[]>({
    queryKey: ['milestone-activities', milestone?.id],
    queryFn: () => api.milestones.getActivities(milestone!.id),
    enabled: !!milestone?.id,
  });

  const isLoading = milestoneLoading || (!!milestone && activitiesLoading);
  const isRefreshing = milestonesFetching || activitiesFetching;
  const handleRefresh = () => { refetchMilestones(); if (milestone) refetchActivities(); };

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
              {milestone?.name ?? 'Milestone Tasks'}
            </h1>
            {milestone && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {milestone.category ? `${milestone.category} · ` : ''}
                {milestone.status ? `${milestone.status} · ` : ''}
                {activities.length} task{activities.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh"
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50 cursor-pointer shrink-0"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Milestone metadata bar */}
      {milestone && (
        <div className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center gap-6 flex-wrap text-xs text-slate-600 dark:text-slate-300">
          {milestone.milestone_number && (
            <span>
              <span className="font-medium text-slate-500 dark:text-slate-400 mr-1">Milestone ID:</span>
              {milestone.milestone_number}
            </span>
          )}
          {milestone.workload && (
            <span>
              <span className="font-medium text-slate-500 dark:text-slate-400 mr-1">Workload:</span>
              {milestone.workload}
            </span>
          )}
          {milestone.commitment && (
            <span>
              <span className="font-medium text-slate-500 dark:text-slate-400 mr-1">Commitment:</span>
              {milestone.commitment}
            </span>
          )}
          {milestone.milestone_date && (
            <span>
              <span className="font-medium text-slate-500 dark:text-slate-400 mr-1">Est. Date:</span>
              {formatDate(milestone.milestone_date)}
            </span>
          )}
          {milestone.monthly_use != null && (
            <span>
              <span className="font-medium text-slate-500 dark:text-slate-400 mr-1">Est. Monthly Usage:</span>
              ${Number(milestone.monthly_use).toLocaleString('en-US')}
            </span>
          )}
          {milestone.owner && (
            <span>
              <span className="font-medium text-slate-500 dark:text-slate-400 mr-1">Owner:</span>
              {milestone.owner}
            </span>
          )}
        </div>
      )}

      <div className="p-6">
        {isLoading && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-12 flex items-center justify-center">
            <Spinner />
          </div>
        )}

        {!isLoading && !milestone && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle size={15} />
            Milestone not found locally. Open the Milestones page for this opportunity to sync it first.
          </div>
        )}

        {!isLoading && milestone && activities.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-12 text-center">
            <p className="text-sm text-slate-400 dark:text-slate-500 italic">
              No activities linked to this milestone yet.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Re-import this opportunity from MSX to sync milestone-linked activities.
            </p>
          </div>
        )}

        {!isLoading && activities.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                    {['Subject / Purpose', 'Type', 'Date', 'Status', 'Account'].map(col => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {activities.map(act => (
                    <tr key={act.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-xs">
                        <span className="line-clamp-2">{act.purpose}</span>
                        {act.notes && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{act.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {act.type}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(act.date)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <Badge label={act.status} variant={statusVariant(act.status)} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {act.account_name ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
