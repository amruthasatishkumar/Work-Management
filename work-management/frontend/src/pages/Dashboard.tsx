import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, StatCard, Badge, statusVariant, Spinner } from '../components/ui';
import type { DashboardData } from '../lib/types';

export default function Dashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: queryKeys.dashboard,
    queryFn: api.dashboard.get,
  });

  if (isLoading) return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your territories and work" />
      <Spinner />
    </div>
  );

  const s = data?.stats;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your territories and work" />

      {/* Stats grid */}
      <div className="p-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link to="/territories" className="block hover:opacity-80 transition-opacity"><StatCard label="Territories" value={s?.territories ?? 0} color="slate" /></Link>
        <Link to="/accounts" className="block hover:opacity-80 transition-opacity"><StatCard label="Accounts" value={s?.accounts ?? 0} color="blue" /></Link>
        <Link to="/opportunities?status=Active" className="block hover:opacity-80 transition-opacity"><StatCard label="Active Opportunities" value={s?.opportunities_active ?? 0} sub={`${s?.opportunities_total ?? 0} total`} color="green" /></Link>
        <Link to="/activities?exclude_completed=1" className="block hover:opacity-80 transition-opacity"><StatCard label="Remaining Activities" value={s?.activities_upcoming ?? 0} sub={`${s?.activities_total ?? 0} total`} color="amber" /></Link>
        <Link to="/se-work" className="block hover:opacity-80 transition-opacity sm:col-span-2"><StatCard label="SE Work (Not Started)" value={s?.se_not_started ?? 0} color="purple" /></Link>
        <Link to="/se-work" className="block hover:opacity-80 transition-opacity sm:col-span-2"><StatCard label="SE Work (In Progress)" value={s?.se_inprogress ?? 0} color="red" /></Link>
      </div>

      <div className="px-6 pb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Active Opportunities */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Active Opportunities</h3>
            <Link to="/opportunities?status=Active" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {(data?.active_opportunities ?? []).length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500 px-4 py-6 text-center">No active opportunities</p>
            )}
            {(data?.active_opportunities ?? []).map((opp) => (
              <Link key={opp.id} to={`/accounts/${opp.account_id}`} className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{opp.title}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{opp.account_name} · {opp.territory_name}</p>
                  </div>
                  <Badge label={opp.status} variant={statusVariant(opp.status)} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Upcoming Activities */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Remaining Activities</h3>
            <Link to="/activities?exclude_completed=1" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {(data?.remaining_activities ?? []).length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500 px-4 py-6 text-center">No remaining activities</p>
            )}
            {(data?.remaining_activities ?? []).map((act) => (
              <Link key={act.id} to={`/accounts/${act.account_id}`} className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{act.purpose}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{act.account_name} · {act.date}</p>
                  </div>
                  <Badge label={act.type} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent Activities */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent Activities</h3>
            <Link to="/activities" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {(data?.recent_activities ?? []).length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500 px-4 py-6 text-center">No activities yet</p>
            )}
            {(data?.recent_activities ?? []).map((act) => (
              <div key={act.id} className="px-4 py-3 flex items-center gap-4">
                <Badge label={act.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-100 truncate">{act.purpose}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{act.account_name}{act.opportunity_title ? ` · ${act.opportunity_title}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge label={act.status} variant={statusVariant(act.status)} />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{act.date}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
