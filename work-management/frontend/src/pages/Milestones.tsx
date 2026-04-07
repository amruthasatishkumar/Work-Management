import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { type Milestone } from '../lib/types';
import { PageHeader, Badge, Spinner, EmptyState, statusVariant } from '../components/ui';

export default function Milestones() {
  const { data: milestones = [], isLoading } = useQuery({
    queryKey: queryKeys.milestones.all(),
    queryFn: () => api.milestones.list(),
  });

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div>
      <PageHeader
        title="Milestones"
        subtitle={`${milestones.length} milestone${milestones.length !== 1 ? 's' : ''} across your opportunities`}
      />

      <div className="p-6">
        {isLoading ? (
          <Spinner />
        ) : milestones.length === 0 ? (
          <EmptyState
            title="No milestones found"
            description="Import opportunities from MSX to see their milestones here"
          />
        ) : (
          <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/50 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/80">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Milestone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Opportunity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Account</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/30">
                {(milestones as Milestone[]).map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{m.name}</div>
                      {m.workload && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{m.workload}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.opportunity_title ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.account_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.category ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(m.milestone_date)}</td>
                    <td className="px-4 py-3">
                      {m.status ? <Badge label={m.status} variant={statusVariant(m.status)} /> : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
