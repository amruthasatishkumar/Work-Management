import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, Badge, Spinner, EmptyState } from '../components/ui';
import { Select } from '../components/Modal';
import type { Territory, Account, Opportunity, Milestone } from '../lib/types';

function milestoneStatusVariant(status: string | null): 'default' | 'active' | 'won' | 'lost' | 'onhold' | 'planned' | 'inprogress' | 'completed' | 'cancelled' {
  if (!status) return 'default';
  const s = status.toLowerCase();
  if (s.includes('complete') || s.includes('achieved')) return 'completed';
  if (s.includes('progress')) return 'inprogress';
  if (s.includes('at risk') || s.includes('delayed')) return 'onhold';
  if (s.includes('missed') || s.includes('fail')) return 'lost';
  if (s.includes('planned')) return 'planned';
  return 'default';
}

export default function Milestones() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filterTerritory = searchParams.get('territory') ?? '';
  const filterAccount   = searchParams.get('account')   ?? '';
  const filterOpp       = searchParams.get('opp')       ?? '';
  const [myMilestones, setMyMilestones] = useState(false);

  const setFilter = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  const handleTerritoryChange = (val: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) next.set('territory', val); else next.delete('territory');
      next.delete('account');
      next.delete('opp');
      return next;
    }, { replace: true });
  };

  const handleAccountChange = (val: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) next.set('account', val); else next.delete('account');
      next.delete('opp');
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

  const filterParams = {
    territory_id: filterTerritory ? Number(filterTerritory) : undefined,
    account_id: filterAccount ? Number(filterAccount) : undefined,
  };

  const { data: opps = [] } = useQuery<Opportunity[]>({
    queryKey: queryKeys.opportunities.all(filterParams),
    queryFn: () => api.opportunities.list(filterParams),
  });

  const milestoneParams = {
    territory_id: filterTerritory ? Number(filterTerritory) : undefined,
    account_id: filterAccount ? Number(filterAccount) : undefined,
    opportunity_id: filterOpp ? Number(filterOpp) : undefined,
    on_team: myMilestones || undefined,
  };

  const { data: milestones = [], isLoading } = useQuery<Milestone[]>({
    queryKey: queryKeys.milestones.all(milestoneParams),
    queryFn: () => api.milestones.list(milestoneParams),
  });

  const hasFilters = filterTerritory || filterAccount || filterOpp;

  return (
    <div>
      <PageHeader
        title="Milestones"
        subtitle="Engagement milestones across your opportunities"
        action={null}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <Select value={filterTerritory} onChange={e => handleTerritoryChange(e.target.value)} className="!w-44">
          <option value="">All territories</option>
          {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select
          value={filterAccount}
          onChange={e => handleAccountChange(e.target.value)}
          disabled={!filterTerritory}
          className="!w-48"
        >
          <option value="">{filterTerritory ? 'All accounts' : 'Select territory first'}</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select
          value={filterOpp}
          onChange={e => setFilter('opp', e.target.value)}
          disabled={!filterAccount}
          className="!w-56"
        >
          <option value="">{filterAccount ? 'All opportunities' : 'Select account first'}</option>
          {opps.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
        </Select>

        <button
          onClick={() => setMyMilestones(v => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            myMilestones
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400'
          }`}
        >
          <Users size={13} />
          My Milestones
        </button>

        {(hasFilters || myMilestones) && (
          <button
            onClick={() => { setSearchParams({}, { replace: true }); setMyMilestones(false); }}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {isLoading && <Spinner />}
      {!isLoading && milestones.length === 0 && (
        <EmptyState
          title="No milestones found"
          description="Import opportunities from MSX to populate milestones, or adjust filters."
        />
      )}

      {!isLoading && milestones.length > 0 && (
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="pb-2 pr-4 font-medium">#</th>
                <th className="pb-2 pr-4 font-medium">Milestone</th>
                <th className="pb-2 pr-4 font-medium">Workload</th>
                <th className="pb-2 pr-4 font-medium">Commitment</th>
                <th className="pb-2 pr-4 font-medium">Category</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Owner</th>
                <th className="pb-2 pr-4 font-medium">Opportunity</th>
                <th className="pb-2 font-medium">Account</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map(m => (
                <tr
                  key={m.id}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {m.milestone_number ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4 min-w-[180px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-800 dark:text-slate-100 font-medium">{m.name ?? '—'}</span>
                      {m.on_team === 1 && (
                        <span title="You are on the milestone team" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          <Users size={10} /> Team
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {m.workload ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {m.commitment ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {m.category ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    {m.status ? <Badge label={m.status} variant={milestoneStatusVariant(m.status)} /> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {m.milestone_date ? m.milestone_date.split('T')[0] : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {m.owner ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4 min-w-[160px]">
                    <Link
                      to={`/opportunities/${m.opportunity_id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline line-clamp-1"
                    >
                      {m.opportunity_title ?? `Opp #${m.opportunity_id}`}
                    </Link>
                  </td>
                  <td className="py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {m.account_name ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
