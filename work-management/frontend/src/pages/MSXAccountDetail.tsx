import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
  Download,
  Check,
  Loader2,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';

const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
const FV = '@OData.Community.Display.V1.FormattedValue';

const ACCOUNT_SELECT = [
  'accountid',
  'name',
  'accountnumber',
  'address1_city',
  'address1_stateorprovince',
  'address1_country',
  'msp_mstopparentid',
  'websiteurl',
  '_ownerid_value',
].join(',');

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

function mapOppStatus(statecode: number): string {
  if (statecode === 1) return 'Committed';
  if (statecode === 2) return 'Not Active';
  return 'Active';
}

// Find a field whose key contains any of the given fragments. Prefers FormattedValue.
function pickFieldRaw(obj: any, fragments: string[]): string | null {
  if (!obj) return null;
  const keys = Object.keys(obj);
  for (const frag of fragments) {
    const f = frag.toLowerCase();
    // Prefer formatted value
    const fvKey = keys.find(k => k.toLowerCase().includes(f) && k.endsWith(FV));
    if (fvKey && obj[fvKey] != null && obj[fvKey] !== '') return String(obj[fvKey]);
    // Fallback to raw value (skip lookup-id fields ending in _value unless formatted version is missing)
    const rawKey = keys.find(k => k.toLowerCase().includes(f) && !k.includes('@'));
    if (rawKey && obj[rawKey] != null && obj[rawKey] !== '') return String(obj[rawKey]);
  }
  return null;
}

function pickField(obj: any, fragments: string[]): string {
  return pickFieldRaw(obj, fragments) ?? '—';
}

function mapActivityStatus(statecode: number): string {
  if (statecode === 1) return 'Completed';
  if (statecode === 2) return 'Blocked';
  return 'To Do';
}

function mapActivityType(code: string): string {
  if (['email', 'phonecall', 'appointment', 'teams_meeting'].includes(code)) return 'Meeting';
  return 'Other';
}

async function d365Get<T>(headers: Record<string, string>, url: string): Promise<T[]> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.value ?? [];
}

export default function MSXAccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [territoryId, setTerritoryId] = useState<string>('');
  const [importStatus, setImportStatus] = useState<Record<string, 'idle' | 'importing' | 'done' | 'error'>>({});
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});

  const initHeaders = useCallback(async () => {
    const tokenData = await api.msx.tokenStatus().catch(() => null);
    if (!tokenData?.valid) {
      setTokenError("No valid MSX token. Run 'az login' in a terminal to sign in.");
      return null;
    }
    const h = {
      Authorization: `Bearer ${tokenData.accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'odata.maxpagesize=500,odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    };
    setHeaders(h);
    return h;
  }, []);

  useEffect(() => {
    initHeaders();
  }, [initHeaders]);

  // Live D365 account fetch
  const accountQuery = useQuery({
    queryKey: ['msx-account', accountId],
    enabled: !!headers && !!accountId,
    staleTime: 30_000,
    queryFn: async () => {
      const rows = await d365Get<any>(
        headers!,
        `${D365_BASE}/accounts?$filter=accountid eq '${accountId}'&$select=${ACCOUNT_SELECT}&$top=1`,
      );
      return rows[0] ?? null;
    },
  });

  // Live D365 opportunities for this account
  const oppsQuery = useQuery({
    queryKey: ['msx-account-opps', accountId],
    enabled: !!headers && !!accountId,
    staleTime: 30_000,
    queryFn: async () => {
      return await d365Get<any>(
        headers!,
        `${D365_BASE}/opportunities?$filter=_parentaccountid_value eq '${accountId}' and statecode eq 0&$orderby=name&$top=200`,
      );
    },
  });

  const territoriesQuery = useQuery({
    queryKey: ['territories'],
    queryFn: () => api.territories.list(),
  });

  // Pre-select first territory once loaded
  useEffect(() => {
    if (!territoryId && territoriesQuery.data && territoriesQuery.data.length > 0) {
      setTerritoryId(String(territoriesQuery.data[0].id));
    }
  }, [territoriesQuery.data, territoryId]);

  const importMutation = useMutation({
    mutationFn: (payload: any) => api.msx.import(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });

  async function importOpp(opp: any) {
    if (!headers || !accountQuery.data || !territoryId) return;
    const oppId = opp.opportunityid;
    setImportStatus(s => ({ ...s, [oppId]: 'importing' }));
    setImportErrors(e => {
      const next = { ...e };
      delete next[oppId];
      return next;
    });
    try {
      // Fetch milestones + activities live for this opp
      const milestoneRows = await d365Get<any>(
        headers,
        `${D365_BASE}/msp_engagementmilestones?$filter=_msp_opportunityid_value eq '${oppId}'&$select=${MILESTONE_SELECT}&$orderby=msp_milestonedate`,
      );
      const milestones = milestoneRows.map((m: any) => ({
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

      const activities: any[] = [];
      for (const m of milestoneRows) {
        const mid: string = m.msp_engagementmilestoneid;
        const acts = await d365Get<any>(
          headers,
          `${D365_BASE}/activitypointers?$filter=_regardingobjectid_value eq '${mid}'&$select=activityid,subject,activitytypecode,statecode,scheduledstart,actualend`,
        );
        for (const act of acts) {
          activities.push({
            msxId: act.activityid,
            subject: act.subject || '(No subject)',
            type: mapActivityType(act.activitytypecode),
            entityType: act.activitytypecode,
            status: mapActivityStatus(act.statecode),
            date: act.scheduledstart ? act.scheduledstart.split('T')[0] : new Date().toISOString().split('T')[0],
            completedDate: act.actualend ? act.actualend.split('T')[0] : null,
            milestoneMsxId: mid,
          });
        }
      }

      // Comments
      let annotations: any[] = [];
      try {
        const commentsRes = await fetch(
          `${D365_BASE}/opportunities(${oppId})/msp_forecastcommentsjsonfield`,
          { headers },
        );
        if (commentsRes.ok) {
          const j = await commentsRes.json();
          annotations = JSON.parse(j.value ?? '[]');
        }
      } catch { /* skip */ }

      const acc = accountQuery.data;
      const payload = {
        territoryId: Number(territoryId),
        accounts: [
          {
            msxId: acc.accountid,
            name: acc.name,
            website: acc.websiteurl ?? null,
            tpid: acc.msp_mstopparentid ?? 0,
            opportunities: [
              {
                msxId: opp.opportunityid,
                title: opp.name,
                description: opp.description ?? null,
                status: mapOppStatus(opp.statecode),
                estimatedCloseDate: opp.estimatedclosedate ?? null,
                solutionPlay: pickFieldRaw(opp, ['solutionplay']),
                link: `https://microsoftsales.crm.dynamics.com/main.aspx?etn=opportunity&pagetype=entityrecord&id=${opp.opportunityid}`,
                milestones,
                activities,
                comments: annotations.map((a: any) => ({
                  msxId: a.userId && a.modifiedOn ? `${a.userId}:${a.modifiedOn}` : null,
                  content: a.comment ?? '',
                  createdAt: a.modifiedOn ?? null,
                })),
              },
            ],
          },
        ],
      };

      await importMutation.mutateAsync(payload);
      setImportStatus(s => ({ ...s, [oppId]: 'done' }));
    } catch (err: any) {
      setImportStatus(s => ({ ...s, [oppId]: 'error' }));
      setImportErrors(e => ({ ...e, [oppId]: err.message ?? 'Import failed' }));
    }
  }

  function openOppInMSX(oppId: string) {
    const url = `https://microsoftsales.crm.dynamics.com/main.aspx?etn=opportunity&pagetype=entityrecord&id=${oppId}`;
    const el = window as any;
    if (el.electronAPI?.openExternal) {
      el.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function openAccountInMSX() {
    if (!accountId) return;
    const url = `https://microsoftsales.crm.dynamics.com/main.aspx?etn=account&pagetype=entityrecord&id=${accountId}`;
    const el = window as any;
    if (el.electronAPI?.openExternal) {
      el.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['msx-account', accountId] }),
      qc.invalidateQueries({ queryKey: ['msx-account-opps', accountId] }),
    ]);
  }

  const [showDebug, setShowDebug] = useState(false);

  const account = accountQuery.data;
  const opps = oppsQuery.data ?? [];
  const loading = accountQuery.isLoading || oppsQuery.isLoading;
  const errorMsg =
    tokenError ??
    (accountQuery.error as Error)?.message ??
    (oppsQuery.error as Error)?.message ??
    null;

  return (
    <div>
      <PageHeader
        title={account?.name ?? 'MSX Account'}
        subtitle={
          loading
            ? 'Loading…'
            : account
            ? `${opps.length} open opportunit${opps.length === 1 ? 'y' : 'ies'} in MSX`
            : 'Account details from MSX'
        }
        action={
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/msx-accounts')}
              className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {errorMsg && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Account info card */}
        {account && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                <Field label="Account ID" value={account.accountnumber} mono />
                <Field label="TPID" value={account.msp_mstopparentid} mono />
                <Field label="Owner" value={account[`_ownerid_value${FV}`]} />
                <Field label="City" value={account.address1_city} />
                <Field label="State" value={account.address1_stateorprovince} />
                <Field label="Country" value={account.address1_country} />
                <Field label="Website" value={account.websiteurl} />
              </div>
              <button
                onClick={openAccountInMSX}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shrink-0"
              >
                <ExternalLink size={13} />
                Open in MSX
              </button>
            </div>
          </div>
        )}

        {/* Territory selector */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400 shrink-0">Import to territory:</span>
          <select
            value={territoryId}
            onChange={e => setTerritoryId(e.target.value)}
            className="flex-1 max-w-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {(territoriesQuery.data ?? []).map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Opportunities table */}
        {loading && !account ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Open Opportunities
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                    {['Opportunity', 'Recommendation', 'Opportunity Intent', 'Active Sales Stage', 'Solution Area', 'Solution Play', 'Owner', '', ''].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {opps.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400 dark:text-slate-500">
                        No open opportunities for this account in MSX.
                      </td>
                    </tr>
                  ) : (
                    opps.map(opp => {
                      const status = importStatus[opp.opportunityid] ?? 'idle';
                      const errMsg = importErrors[opp.opportunityid];
                      return (
                        <tr
                          key={opp.opportunityid}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-md">
                            <div className="truncate">{opp.name}</div>
                            {errMsg && (
                              <div className="text-xs text-red-500 mt-0.5 truncate">{errMsg}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap text-xs">
                            {pickField(opp, ['recommendation', 'forecastrecommendation', 'forecastcategory'])}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                            {pickField(opp, ['opportunityintent', 'intent'])}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-48 truncate text-xs">
                            {pickField(opp, ['activesalestage', 'salesstage'])}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                            {pickField(opp, ['solutionarea'])}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                            {pickField(opp, ['solutionplay'])}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                            {opp[`_ownerid_value${FV}`] ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => importOpp(opp)}
                              disabled={status === 'importing' || status === 'done' || !territoryId}
                              title={status === 'done' ? 'Already imported in this session' : 'Import to local DB'}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:cursor-default ${
                                status === 'done'
                                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                  : status === 'error'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                                  : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                              }`}
                            >
                              {status === 'importing' ? (
                                <>
                                  <Loader2 size={12} className="animate-spin" />
                                  Importing
                                </>
                              ) : status === 'done' ? (
                                <>
                                  <Check size={12} />
                                  Imported
                                </>
                              ) : status === 'error' ? (
                                <>
                                  <Download size={12} />
                                  Retry
                                </>
                              ) : (
                                <>
                                  <Download size={12} />
                                  Import
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openOppInMSX(opp.opportunityid)}
                              title="Open in MSX"
                              className="p-1.5 rounded-md text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                            >
                              <ExternalLink size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Debug: show all fields of first opp to find correct field names */}
        {opps.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setShowDebug(v => !v)}
              className="w-full px-4 py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer text-left"
            >
              {showDebug ? '▼' : '▶'} Debug: D365 fields on first opp ({opps[0].name?.slice(0, 60)})
            </button>
            {showDebug && (
              <div className="px-4 pb-4 max-h-96 overflow-auto">
                <table className="w-full text-xs font-mono">
                  <tbody>
                    {Object.entries(opps[0])
                      .filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([k, v]) => (
                        <tr key={k} className="border-b border-slate-100 dark:border-slate-700/50">
                          <td className="py-1 pr-3 text-slate-600 dark:text-slate-300 align-top w-1/2 break-all">{k}</td>
                          <td className="py-1 text-slate-500 dark:text-slate-400 break-all">{String(v)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">{label}</div>
      <div className={`text-sm text-slate-700 dark:text-slate-200 mt-0.5 truncate ${mono ? 'font-mono text-xs' : ''}`}>
        {value ?? '—'}
      </div>
    </div>
  );
}
