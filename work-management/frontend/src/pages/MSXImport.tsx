import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download, RefreshCw, ChevronDown, ChevronRight,
  CheckSquare, Square, AlertCircle, CheckCircle2, Loader2, Plus, X, Users, Link, Hash, AlertTriangle, ExternalLink, Flag,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, Button } from '../components/ui';
import { FormField, Select } from '../components/Modal';
import type { Territory, Account } from '../lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MsxAccountResult {
  tpid: number;
  account: { accountid: string; name: string; websiteurl: string | null } | null;
  opportunities: Array<{
    opportunityid: string;
    name: string;
    description: string | null;
    statecode: number;
    estimatedclosedate: string | null;
    activities: Array<{
      activityid: string;
      subject: string;
      activitytypecode: string;
      statecode: number;
      scheduledstart: string | null;
      actualend: string | null;
    }>;
  }>;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
const MILESTONE_SELECT = [
  'msp_engagementmilestoneid', 'msp_milestonenumber', 'msp_name',
  '_msp_workloadlkid_value', 'msp_commitmentrecommendation', 'msp_milestonecategory',
  'msp_monthlyuse', 'msp_milestonedate', 'msp_milestonestatus', '_ownerid_value',
].join(',');
const FV = '@OData.Community.Display.V1.FormattedValue';

function mapMilestones(raw: any[]): any[] {
  return raw.map(m => ({
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
    onTeam: false, // will be set by checkMilestoneTeam
  }));
}

const MILESTONE_TEAM_TEMPLATE_ID = '316e4735-9e83-eb11-a812-0022481e1be0';

// Checks which milestones the current D365 user is on the team for.
// Returns a Set of milestone msx_ids the user belongs to.
async function checkMilestoneTeam(accessToken: string, userId: string, milestones: any[]): Promise<Set<string>> {
  if (!milestones.length || !userId) return new Set();
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
    const result = await d365Get<any>(accessToken, `${D365_BASE}/teams?fetchXml=${encodeURIComponent(fetchXml)}`);
    return new Set<string>(
      (result ?? [])
        .map((t: any) => String(t._regardingobjectid_value ?? '').toLowerCase().replace(/[{}]/g, ''))
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

async function d365Get<T>(accessToken: string, url: string): Promise<T[]> {
  // webSecurity: false on the Electron main window disables CORS in the renderer.
  // The Chromium renderer already uses the corporate PAC proxy (same as MSX Helper),
  // so plain browser fetch works — CORS was the only blocker.
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'odata.maxpagesize=250,odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const raw: string = body?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 403 || raw.toLowerCase().includes('ip address')) {
      throw new Error('Access denied — please connect to the VPN and authenticate via Azure CLI ("az login").');
    }
    throw new Error(raw);
  }
  const json = await res.json();
  return json.value ?? [];
}

async function searchD365ByTpids(
  accessToken: string,
  tpids: number[]
): Promise<MsxAccountResult[]> {
  const results: MsxAccountResult[] = [];
  for (const tpid of tpids) {
    try {
      const accounts = await d365Get<any>(
        accessToken,
        // _parentaccountid_value eq null filters to parent-level accounts only
        // (same as MSX Helper's "Parents" toggle). Each TPID has exactly one parent.
        `${D365_BASE}/accounts?$filter=msp_mstopparentid eq '${tpid}' and _parentaccountid_value eq null&$select=accountid,name,websiteurl,msp_mstopparentid&$top=1`
      );
      if (!accounts[0]) {
        results.push({ tpid, account: null, opportunities: [] });
        continue;
      }
      const account = accounts[0];
      const opps = await d365Get<any>(
        accessToken,
        // statecode eq 0 = Open only (excludes Won/Lost historical records)
        `${D365_BASE}/opportunities?$filter=_parentaccountid_value eq '${account.accountid}' and statecode eq 0&$select=opportunityid,name,description,statecode,estimatedclosedate`
      );
      const oppsWithActivities: any[] = [];
      for (const opp of opps) {
        const activities = await d365Get<any>(
          accessToken,
          `${D365_BASE}/activitypointers?$filter=_regardingobjectid_value eq '${opp.opportunityid}'&$select=activityid,subject,activitytypecode,statecode,scheduledstart,actualend`
        );
        // Fetch comments from the msp_forecastcommentsjsonfield on the opportunity
        // This field holds a stringified JSON array — not a standard OData collection
        let annotations: any[] = [];
        try {
          const commentsRes = await fetch(
            `${D365_BASE}/opportunities(${opp.opportunityid})/msp_forecastcommentsjsonfield`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
              },
            }
          );
          if (commentsRes.ok) {
            const commentsJson = await commentsRes.json();
            annotations = JSON.parse(commentsJson.value ?? '[]');
          }
        } catch { /* skip comments if unavailable */ }

        // Fetch milestones so they are saved on import
        let milestones: any[] = [];
        try {
          const msRaw = await d365Get<any>(
            accessToken,
            `${D365_BASE}/msp_engagementmilestones?$filter=_msp_opportunityid_value eq '${opp.opportunityid}'&$select=${MILESTONE_SELECT}&$orderby=msp_milestonedate`,
          );
          milestones = mapMilestones(msRaw);
          try {
            const whoRes = await fetch(`${D365_BASE}/WhoAmI`, {
              headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
            });
            const { UserId: rawUid } = whoRes.ok ? await whoRes.json() : {};
            const userId = (rawUid ?? '').toLowerCase().replace(/[{}]/g, '');
            const teamSet = await checkMilestoneTeam(accessToken, userId, milestones);
            milestones = milestones.map(m => ({ ...m, onTeam: teamSet.has((m.msxId ?? '').toLowerCase().replace(/[{}]/g, '')) }));
          } catch { /* onTeam stays false */ }
        } catch { /* skip milestones if unavailable */ }

        oppsWithActivities.push({ ...opp, activities, annotations, milestones });
      }
      results.push({ tpid, account, opportunities: oppsWithActivities });
    } catch (err: any) {
      results.push({ tpid, account: null, opportunities: [], error: err.message });
    }
  }
  return results;
}

function mapOppStatus(statecode: number): string {
  if (statecode === 1) return 'Committed';
  if (statecode === 2) return 'Not Active';
  return 'Active';
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

function minutesToLabel(mins: number): string {
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins} min`;
}

// Parse an MSX opportunity GUID from a full URL or bare GUID string
function parseOppIdFromUrl(input: string): string | null {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get('id');
    if (id) return id.replace(/[{}]/g, '').toLowerCase();
  } catch {}
  const match = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0].toLowerCase() : null;
}

// Fetch a single opportunity + parent account + activities + comments from D365.
// Uses filter queries (same endpoint pattern as TPID search / d365Get) so the
// renderer's Chromium proxy handles auth consistently for all D365 calls.
async function enrichOppById(
  accessToken: string,
  oppId: string,
): Promise<{ account: MsxAccountResult['account']; tpid: number; opp: any }> {
  // Fetch opp with parent account expanded inline — one request, avoids entity-read 401
  const opps = await d365Get<any>(
    accessToken,
    `${D365_BASE}/opportunities?$filter=opportunityid eq '${oppId}'&$expand=parentaccountid($select=accountid,name,websiteurl,msp_mstopparentid)&$top=1`,
  );
  if (!opps[0]) throw new Error(`Opportunity ${oppId} not found in D365`);
  const opp = opps[0];

  let account: MsxAccountResult['account'] = null;
  let tpid = 0;
  const accData = opp.parentaccountid; // navigation property expanded inline
  if (accData?.accountid) {
    account = { accountid: accData.accountid, name: accData.name, websiteurl: accData.websiteurl ?? null };
    tpid = accData.msp_mstopparentid ?? 0;
  } else if (opp._parentaccountid_value) {
    // Fallback: parent account exists but expand didn't return data — build minimal object
    // so the opportunity is still importable (backend upserts by msx_id/accountid).
    const displayName: string =
      opp['_parentaccountid_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown Account';
    account = { accountid: opp._parentaccountid_value, name: displayName, websiteurl: null };
  }

  const activities = await d365Get<any>(
    accessToken,
    `${D365_BASE}/activitypointers?$filter=_regardingobjectid_value eq '${oppId}'&$select=activityid,subject,activitytypecode,statecode,scheduledstart,actualend`,
  );

  let annotations: any[] = [];
  try {
    const commentsRes = await fetch(
      `${D365_BASE}/opportunities(${oppId})/msp_forecastcommentsjsonfield`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
      },
    );
    if (commentsRes.ok) {
      const j = await commentsRes.json();
      annotations = JSON.parse(j.value ?? '[]');
    }
  } catch { /* skip */ }

  // Fetch milestones so they are saved on import
  let milestones: any[] = [];
  try {
    const msRaw = await d365Get<any>(
      accessToken,
      `${D365_BASE}/msp_engagementmilestones?$filter=_msp_opportunityid_value eq '${oppId}'&$select=${MILESTONE_SELECT}&$orderby=msp_milestonedate`,
    );
    milestones = mapMilestones(msRaw);
    try {
      const whoRes = await fetch(`${D365_BASE}/WhoAmI`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
      });
      const { UserId: rawUid } = whoRes.ok ? await whoRes.json() : {};
      const userId = (rawUid ?? '').toLowerCase().replace(/[{}]/g, '');
      const teamSet = await checkMilestoneTeam(accessToken, userId, milestones);
      milestones = milestones.map(m => ({ ...m, onTeam: teamSet.has((m.msxId ?? '').toLowerCase().replace(/[{}]/g, '')) }));
    } catch { /* onTeam stays false */ }
  } catch { /* skip milestones if unavailable */ }

  return { account, tpid, opp: { ...opp, activities, annotations, milestones } };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MSXImport() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [tpidInput, setTpidInput] = useState('');
  const [results, setResults] = useState<MsxAccountResult[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());
  const [expandedOpps, setExpandedOpps] = useState<Set<string>>(new Set());
  // selectedOpps: Set of `${tpidIndex}:${oppId}`
  const [selectedOpps, setSelectedOpps] = useState<Set<string>>(new Set());
  const [territoryId, setTerritoryId] = useState('');
  const [showNewTerritory, setShowNewTerritory] = useState(false);
  const [newTerritoryName, setNewTerritoryName] = useState('');
  const newTerritoryInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ accounts: number; opportunities: number; activities: number } | null>(null);
  const [pendingPayload, setPendingPayload] = useState<any[] | null>(null);
  const [duplicateTitles, setDuplicateTitles] = useState<string[]>([]);
  const [multipleTerritoriesWarning, setMultipleTerritoriesWarning] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);

  // Token status — fetched on mount and on refresh
  const { data: tokenData, isLoading: tokenLoading, refetch: refreshToken } = useQuery({
    queryKey: ['msx-token-status'],
    queryFn: api.msx.tokenStatus,
    retry: false,
    staleTime: 60_000,
  });

  const { data: territories = [] } = useQuery<Territory[]>({
    queryKey: queryKeys.territories.all,
    queryFn: api.territories.list,
  });

  const { data: localAccounts = [] } = useQuery<Account[]>({
    queryKey: queryKeys.accounts.all(),
    queryFn: () => api.accounts.list(),
  });

  // Search mutation — calls D365 directly via browser fetch (Chromium system proxy)
  const searchMutation = useMutation({
    mutationFn: async (tpids: number[]) => {
      const freshToken = await api.msx.tokenStatus();
      if (!freshToken?.valid || !freshToken?.accessToken) {
        throw new Error('Azure CLI token not available. Run "az login" and click Refresh.');
      }
      const results = await searchD365ByTpids(freshToken.accessToken, tpids);
      return { results };
    },
    onSuccess: (data) => {
      setResults(data.results ?? []);
      setSelectedOpps(new Set());
      setExpandedAccounts(new Set());
      setImportResult(null);
      // Auto-expand results with accounts found
      const autoExpand = new Set<number>();
      (data.results ?? []).forEach((r: MsxAccountResult, i: number) => {
        if (r.account) autoExpand.add(i);
      });
      setExpandedAccounts(autoExpand);
      // Auto-populate territory: find any returned account already saved locally with a territory
      const returnedTpids = (data.results ?? [])
        .filter((r: MsxAccountResult) => r.account)
        .map((r: MsxAccountResult) => r.tpid);
      const matchedLocal = localAccounts.filter(a => a.tpid && returnedTpids.includes(a.tpid));
      const matchedTerritoryIds = matchedLocal.map(a => String(a.territory_id)).filter(Boolean);
      const uniqueTerritory = [...new Set(matchedTerritoryIds)];
      const allMatched = returnedTpids.length > 0 && matchedLocal.length === returnedTpids.length;
      if (uniqueTerritory.length === 1 && allMatched) {
        setTerritoryId(uniqueTerritory[0]);
        setMultipleTerritoriesWarning(false);
      } else if (uniqueTerritory.length > 1 || (returnedTpids.length > 1 && !allMatched)) {
        setMultipleTerritoriesWarning(true);
      } else {
        setMultipleTerritoriesWarning(false);
      }
    },
  });

  const createTerritoryMutation = useMutation({
    mutationFn: (name: string) => api.territories.create({ name }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: queryKeys.territories.all });
      setTerritoryId(String(created.id));
      setNewTerritoryName('');
      setShowNewTerritory(false);
    },
  });

  const handleCreateTerritory = () => {
    const name = newTerritoryName.trim();
    if (!name) return;
    createTerritoryMutation.mutate(name);
  };

  // URL-based single-opp import
  const urlImportMutation = useMutation({
    mutationFn: async (oppId: string) => {
      const freshToken = await api.msx.tokenStatus();
      if (!freshToken?.valid || !freshToken?.accessToken)
        throw new Error('Azure CLI token not available. Run "az login" and click Refresh.');
      return await enrichOppById(freshToken.accessToken, oppId);
    },
    onSuccess: (data) => {
      setResults([{ tpid: data.tpid, account: data.account, opportunities: [data.opp] }]);
      setSelectedOpps(new Set(['0:0']));
      setExpandedAccounts(new Set([0]));
      setImportResult(null);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    },
  });

  // Deal team import — loads all open opps the current user is on the deal team for
  const DEAL_TEAM_TEMPLATE_ID = 'cc923a9d-7651-e311-9405-00155db3ba1e';
  const dealTeamMutation = useMutation({
    mutationFn: async () => {
      const freshToken = await api.msx.tokenStatus();
      if (!freshToken?.valid || !freshToken?.accessToken)
        throw new Error('Azure CLI token not available. Run "az login" and click Refresh.');
      const token = freshToken.accessToken;

      // Step 1 — decode AAD Object ID from the JWT (base64url → standard base64)
      let aadOid = '';
      try {
        const b64u = token.split('.')[1];
        const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - b64u.length % 4) % 4);
        const payload = JSON.parse(atob(b64));
        aadOid = (payload.oid ?? payload.sub ?? '').toLowerCase().replace(/[{}]/g, '');
      } catch { /* non-fatal */ }
      if (!aadOid) throw new Error('Could not decode user identity from token.');

      // Step 2 — resolve the D365 systemuserid from the AAD OID.
      // The JWT oid != D365 systemuserid; they are linked via azureactivedirectoryobjectid.
      const sysUsers = await d365Get<any>(
        token,
        `${D365_BASE}/systemusers?$filter=azureactivedirectoryobjectid eq '${aadOid}'&$select=systemuserid&$top=1`,
      );
      if (!sysUsers[0]?.systemuserid) throw new Error('Could not find your D365 user record. Make sure you are provisioned in MSX.');
      const userId = sysUsers[0].systemuserid.toLowerCase().replace(/[{}]/g, '');

      const fetchXml = `<fetch distinct="true" no-lock="true">
        <entity name="team">
          <attribute name="teamid"/>
          <attribute name="regardingobjectid"/>
          <filter type="and">
            <condition attribute="teamtype" operator="eq" value="1"/>
            <condition attribute="teamtemplateid" operator="eq" value="{${DEAL_TEAM_TEMPLATE_ID}}"/>
          </filter>
          <link-entity name="teammembership" from="teamid" to="teamid" link-type="inner" alias="tm">
            <filter type="and">
              <condition attribute="systemuserid" operator="eq" value="${userId}"/>
            </filter>
          </link-entity>
        </entity>
      </fetch>`;

      const teams = await d365Get<any>(
        token,
        `${D365_BASE}/teams?fetchXml=${encodeURIComponent(fetchXml)}`,
      );

      const oppIds: string[] = Array.from(new Set(
        teams
          .map((t: any) => String(t._regardingobjectid_value ?? '').replace(/[{}]/g, '').toLowerCase())
          .filter(Boolean),
      ));
      if (oppIds.length === 0) return [];

      const enriched = await Promise.all(
        oppIds.map(id => enrichOppById(token, id).catch(() => null)),
      );
      return enriched.filter((x): x is NonNullable<typeof x> => x !== null);
    },
    onSuccess: (items) => {
      if (!items.length) { setResults([]); setSelectedOpps(new Set()); setImportResult(null); return; }
      const grouped = new Map<string, MsxAccountResult>();
      for (const { account, tpid, opp } of items) {
        const key = account?.accountid ?? '__unknown__';
        if (!grouped.has(key)) grouped.set(key, { tpid, account, opportunities: [] });
        grouped.get(key)!.opportunities.push(opp);
      }
      const newResults = Array.from(grouped.values());
      setResults(newResults);
      setSelectedOpps(new Set());
      setExpandedAccounts(new Set(newResults.map((_, i) => i)));
      setImportResult(null);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (payload: any) => api.msx.import(payload),
    onSuccess: (data) => {
      setImportResult(data.imported);
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  const handleUrlImport = () => {
    const oppId = parseOppIdFromUrl(urlInput);
    if (!oppId) return;
    urlImportMutation.mutate(oppId);
  };

  const handleSearch = () => {
    const tpids = tpidInput
      .split(/[\n,\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n) && n > 0);

    if (tpids.length === 0) return;
    searchMutation.mutate(tpids);
  };

  const toggleAccountExpand = (idx: number) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleOppExpand = (key: string) => {
    setExpandedOpps(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleOpp = (key: string) => {
    setSelectedOpps(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAllInAccount = (idx: number, result: MsxAccountResult) => {
    const keys = result.opportunities.map((_, oi) => `${idx}:${oi}`);
    const allSelected = keys.every(k => selectedOpps.has(k));
    setSelectedOpps(prev => {
      const next = new Set(prev);
      if (allSelected) {
        keys.forEach(k => next.delete(k));
      } else {
        keys.forEach(k => next.add(k));
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!territoryId) return;

    const accountsPayload = results
      .filter(r => r.account)
      .map((r, idx) => {
        const selectedOppsForAccount = r.opportunities.filter((_, oi) => selectedOpps.has(`${idx}:${oi}`));
        if (selectedOppsForAccount.length === 0) return null;

        return {
          msxId: r.account!.accountid,
          name: r.account!.name,
          website: r.account!.websiteurl ?? null,
          tpid: r.tpid,
          opportunities: selectedOppsForAccount.map(opp => ({
            msxId: opp.opportunityid,
            title: opp.name,
            description: opp.description ?? null,
            status: mapOppStatus(opp.statecode),
            estimatedCloseDate: opp.estimatedclosedate ?? null,
            solutionPlay: (opp as any)['msp_solutionplay@OData.Community.Display.V1.FormattedValue'] ?? ((opp as any).msp_solutionplay != null ? String((opp as any).msp_solutionplay) : null),
            link: `https://microsoftsales.crm.dynamics.com/main.aspx?etn=opportunity&pagetype=entityrecord&id=${opp.opportunityid}`,
            activities: opp.activities.map(act => ({
              msxId: act.activityid,
              subject: act.subject || '(No subject)',
              type: mapActivityType(act.activitytypecode),
              entityType: act.activitytypecode,
              status: mapActivityStatus(act.statecode),
              date: act.scheduledstart ? act.scheduledstart.split('T')[0] : new Date().toISOString().split('T')[0],
              completedDate: act.actualend ? act.actualend.split('T')[0] : null,
            })),
            comments: ((opp as any).annotations ?? []).map((a: any) => ({
              // Use userId+modifiedOn as a stable synthetic key (no native ID on this field)
              msxId: a.userId && a.modifiedOn ? `${a.userId}:${a.modifiedOn}` : null,
              content: a.comment ?? '',
              createdAt: a.modifiedOn ?? null,
            })),
            milestones: (opp as any).milestones ?? [],
          })),
        };
      })
      .filter(Boolean);

    if (accountsPayload.length === 0) return;

    // Collect all selected opportunity msx_ids and check for duplicates
    const allOppMsxIds = accountsPayload.flatMap((a: any) => a.opportunities.map((o: any) => o.msxId));
    const { existing } = await api.msx.checkExisting(allOppMsxIds);

    if (existing.length > 0) {
      setDuplicateTitles(existing);
      setPendingPayload(accountsPayload);
      return; // show confirm dialog
    }

    importMutation.mutate({ territoryId: Number(territoryId), accounts: accountsPayload });
  };

  const confirmOverwrite = () => {
    if (!pendingPayload) return;
    importMutation.mutate({ territoryId: Number(territoryId), accounts: pendingPayload });
    setPendingPayload(null);
    setDuplicateTitles([]);
  };

  const totalSelected = selectedOpps.size;
  const hasResults = results.length > 0;

  const authAction = tokenLoading ? (
    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 size={14} className="animate-spin" /> Checking…
    </div>
  ) : tokenData?.valid ? (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={15} className="text-green-500 shrink-0" />
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">Authenticated</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Token valid for {minutesToLabel(tokenData.minutesRemaining)}</span>
          </div>
          {tokenData.userId && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Authenticated as <span className="font-medium text-slate-700 dark:text-slate-200">{tokenData.userId}</span>
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => refreshToken()}
        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
      >
        <RefreshCw size={12} /> Refresh
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <AlertCircle size={15} className="text-red-500 shrink-0" />
      <span className="text-sm text-red-600 dark:text-red-400 font-medium">Token not available</span>
      <button
        onClick={() => refreshToken()}
        className="flex items-center gap-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-medium"
      >
        <RefreshCw size={12} /> Generate Token
      </button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader
        title="MSX Import"
        subtitle="Import accounts and opportunities from MSX"
        action={authAction}
      />

      <div className="p-6 flex gap-6 items-start">

        {/* ── Left column: TPID + results ──────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">

        {/* ── Import by URL Card ──────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Link size={14} className="text-slate-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Import Opportunity by URL</h2>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            Paste an MSX Opportunity to import a single opportunity.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleUrlImport(); }}
              placeholder="https://microsoftsales.crm.dynamics.com/…?id={GUID}"
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 placeholder-slate-300 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button
              onClick={handleUrlImport}
              disabled={!urlInput.trim() || urlImportMutation.isPending || !tokenData?.valid}
            >
              {urlImportMutation.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Fetching…</>
                : <><Download size={14} /> Fetch</>}
            </Button>
          </div>
          {urlImportMutation.isError && (
            <div className="mt-2 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">{(urlImportMutation.error as Error).message}</p>
            </div>
          )}
          {urlImportMutation.isSuccess && urlImportMutation.data && (
            <div className="mt-2 flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
              <CheckCircle2 size={14} className="text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-xs text-green-700 dark:text-green-300">
                Fetched <span className="font-medium">{urlImportMutation.data.opp?.name ?? 'opportunity'}</span> — select a territory below and click Import.
              </p>
            </div>
          )}
        </div>

        {/* ── Deal Team Import Card ────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users size={14} className="text-slate-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Import Deal Team Opportunities</h2>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Load all open MSX opportunities where you are a member of the deal team.
            </p>
            <Button
              onClick={() => dealTeamMutation.mutate()}
              disabled={dealTeamMutation.isPending || !tokenData?.valid}
            >
              {dealTeamMutation.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Loading…</>
                : <><Users size={14} /> Load My Deal Teams</>}
            </Button>
          </div>
          {dealTeamMutation.isSuccess && !dealTeamMutation.isPending && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              Found{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">{dealTeamMutation.data?.length ?? 0}</span>{' '}
              opportunit{(dealTeamMutation.data?.length ?? 0) !== 1 ? 'ies' : 'y'} across{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">{results.length}</span>{' '}
              account{results.length !== 1 ? 's' : ''}.
            </p>
          )}
          {dealTeamMutation.isError && (
            <div className="mt-2 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">{(dealTeamMutation.error as Error).message}</p>
            </div>
          )}
        </div>

        {/* ── TPID Input Card ─────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Hash size={14} className="text-slate-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">MS Top Parent IDs (TPIDs)</h2>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            Enter one or more TPIDs — one per line or comma-separated.{' '}
            <span className="text-slate-500">Find TPID in MSX: Open account → look for MS Top Parent ID field.</span>
          </p>

          <textarea
            value={tpidInput}
            onChange={e => setTpidInput(e.target.value)}
            placeholder={'5800299\n4891587\n16995352'}
            rows={5}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 placeholder-slate-300 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="flex items-center justify-between gap-4 mt-1.5">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Tip: Click on an account in the Account Reference sidebar to autofill its TPID.
            </p>
            <Button
              onClick={handleSearch}
              disabled={!tpidInput.trim() || searchMutation.isPending || !tokenData?.valid}
            >
              {searchMutation.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Searching…</>
                : <><Download size={14} /> Search MSX</>}
            </Button>
          </div>

          {searchMutation.isError && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">{(searchMutation.error as Error).message}</p>
            </div>
          )}
        </div>

        {/* ── Results Card ─────────────────────────────────────────────── */}
        {hasResults && (
          <div ref={resultsRef} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col gap-4">
            {/* Territory + Import controls */}
            <div className="flex flex-col gap-3">
              <FormField label="Assign to Territory">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Select value={territoryId} onChange={e => setTerritoryId(e.target.value)} required>
                      <option value="">Select territory…</option>
                      {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                    {!showNewTerritory && (
                      <button
                        type="button"
                        onClick={() => { setShowNewTerritory(true); setTimeout(() => newTerritoryInputRef.current?.focus(), 0); }}
                        className="shrink-0 flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 whitespace-nowrap"
                      >
                        <Plus size={12} /> New territory
                      </button>
                    )}
                  </div>
                  {showNewTerritory && (
                    <div className="flex items-center gap-2">
                      <input
                        ref={newTerritoryInputRef}
                        type="text"
                        value={newTerritoryName}
                        onChange={e => setNewTerritoryName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateTerritory(); if (e.key === 'Escape') { setShowNewTerritory(false); setNewTerritoryName(''); } }}
                        placeholder="Territory name…"
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 placeholder-slate-300 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleCreateTerritory}
                        disabled={!newTerritoryName.trim() || createTerritoryMutation.isPending}
                        className="shrink-0 flex items-center gap-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                      >
                        {createTerritoryMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewTerritory(false); setNewTerritoryName(''); }}
                        className="shrink-0 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {createTerritoryMutation.isError && (
                    <p className="text-xs text-red-600">{(createTerritoryMutation.error as Error).message}</p>
                  )}
                  {multipleTerritoriesWarning && !territoryId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle size={12} className="shrink-0" />
                      Multiple accounts detected — please select a territory.
                    </p>
                  )}
                </div>
              </FormField>

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {totalSelected} opportunit{totalSelected !== 1 ? 'ies' : 'y'} selected
                </p>
                <div className="flex gap-2">
                  {importResult && (
                    <Button variant="secondary" onClick={() => navigate('/accounts')}>View Accounts</Button>
                  )}
                  <Button
                    onClick={handleImport}
                    disabled={totalSelected === 0 || !territoryId || importMutation.isPending}
                  >
                    {importMutation.isPending
                      ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
                      : <><Download size={14} /> Import Selected ({totalSelected})</>}
                  </Button>
                </div>
              </div>

              {importMutation.isError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                  <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700 dark:text-red-300">{(importMutation.error as Error).message}</p>
                </div>
              )}

              {importResult && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
                  <CheckCircle2 size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Imported <strong>{importResult.accounts}</strong> account{importResult.accounts !== 1 ? 's' : ''},{' '}
                    <strong>{importResult.opportunities}</strong> opportunit{importResult.opportunities !== 1 ? 'ies' : 'y'},{' '}
                    <strong>{importResult.activities}</strong> activit{importResult.activities !== 1 ? 'ies' : 'y'}.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-3">
                Results — {results.filter(r => r.account).length} account{results.filter(r => r.account).length !== 1 ? 's' : ''} found
              </h2>

            {results.map((r, idx) => {
              const isExpanded = expandedAccounts.has(idx);
              const oppKeys = r.opportunities.map((_, oi) => `${idx}:${oi}`);
              const allSelected = oppKeys.length > 0 && oppKeys.every(k => selectedOpps.has(k));

              return (
                <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  {/* Account header */}
                  <button
                    onClick={() => r.account && toggleAccountExpand(idx)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors ${r.account ? 'bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600' : 'bg-red-50 dark:bg-red-900/30 cursor-default'}`}
                  >
                    <div className="flex items-center gap-2">
                      {r.account ? (
                        isExpanded ? <ChevronDown size={14} className="text-slate-400 dark:text-slate-500" /> : <ChevronRight size={14} className="text-slate-400 dark:text-slate-500" />
                      ) : (
                        <AlertCircle size={14} className="text-red-400" />
                      )}
                      <span className={r.account ? 'text-slate-800 dark:text-slate-100' : 'text-red-600 dark:text-red-400'}>
                        {r.account ? r.account.name : `TPID ${r.tpid} — not found`}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">TPID: {r.tpid}</span>
                    </div>
                    {r.account && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 dark:text-slate-500">{r.opportunities.length} opportunit{r.opportunities.length !== 1 ? 'ies' : 'y'}</span>
                        {r.opportunities.length > 0 && (
                          <button
                            onClick={e => { e.stopPropagation(); toggleAllInAccount(idx, r); }}
                            className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                          >
                            {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                            {allSelected ? 'Deselect all' : 'Select all'}
                          </button>
                        )}
                      </div>
                    )}
                  </button>

                  {/* Error message */}
                  {r.error && (
                    <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-xs text-red-600 dark:text-red-400">{r.error}</div>
                  )}

                  {/* Opportunities list */}
                  {r.account && isExpanded && (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                      {r.opportunities.length === 0 && (
                        <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 italic">No opportunities found for this account.</p>
                      )}
                      {r.opportunities.map((opp, oi) => {
                        const oppKey = `${idx}:${oi}`;
                        const isOppExpanded = expandedOpps.has(oppKey);
                        const isSelected = selectedOpps.has(oppKey);

                        return (
                          <div key={opp.opportunityid} className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <button onClick={() => toggleOpp(oppKey)} className="shrink-0 text-indigo-500 hover:text-indigo-700">
                                {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-slate-800 dark:text-slate-100 font-medium truncate">{opp.name}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                    opp.statecode === 1 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                    opp.statecode === 2 ? 'bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300' :
                                    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                  }`}>
                                    {mapOppStatus(opp.statecode)}
                                  </span>
                                  <a
                                    href={`https://microsoftsales.crm.dynamics.com/main.aspx?etn=opportunity&pagetype=entityrecord&id=${opp.opportunityid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open in MSX"
                                    className="text-slate-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400 shrink-0"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <ExternalLink size={11} />
                                  </a>
                                </div>
                                <button
                                  onClick={() => toggleOppExpand(oppKey)}
                                  className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mt-0.5"
                                >
                                  {isOppExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                  {opp.activities.length} activit{opp.activities.length !== 1 ? 'ies' : 'y'}
                                  {((opp as any).milestones?.length ?? 0) > 0 && (
                                    <span className="flex items-center gap-0.5 ml-1 text-purple-400 dark:text-purple-500">
                                      <Flag size={9} />
                                      {(opp as any).milestones.length} milestone{(opp as any).milestones.length !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Activities preview */}
                            {isOppExpanded && opp.activities.length > 0 && (
                              <div className="mt-2 ml-7 flex flex-col gap-1">
                                {opp.activities.map(act => (
                                  <div key={act.activityid} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <span className="text-slate-300 dark:text-slate-600">·</span>
                                    <span className="truncate">{act.subject || '(No subject)'}</span>
                                    <span className="shrink-0 text-slate-300 dark:text-slate-500">{mapActivityType(act.activitytypecode)}</span>
                                    <span className={`shrink-0 px-1 py-0.5 rounded text-xs ${
                                      act.statecode === 1 ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                                      act.statecode === 2 ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' :
                                      'bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400'
                                    }`}>
                                      {mapActivityStatus(act.statecode)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Milestones preview */}
                            {isOppExpanded && ((opp as any).milestones?.length ?? 0) > 0 && (
                              <div className="mt-1.5 ml-7 flex flex-col gap-1">
                                <span className="text-xs font-medium text-purple-400 dark:text-purple-500 mb-0.5">Milestones</span>
                                {(opp as any).milestones.map((m: any) => (
                                  <div key={m.msxId} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <Flag size={9} className="shrink-0 text-purple-300 dark:text-purple-600" />
                                    <span className="truncate">{m.name || '(Unnamed)'}</span>
                                    {m.milestoneDate && <span className="shrink-0 text-slate-300 dark:text-slate-500">{m.milestoneDate}</span>}
                                    {m.status && (
                                      <span className={`shrink-0 px-1 py-0.5 rounded text-xs ${
                                        m.status.toLowerCase().includes('on track') ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                                        m.status.toLowerCase().includes('at risk') ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                                        m.status.toLowerCase().includes('behind') ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' :
                                        'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                      }`}>
                                        {m.status}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            </div>
          </div>
        )}
        </div>{/* end left column */}

        {/* ── Right column: Account Reference Table ───────────────────── */}
        <div className="w-80 shrink-0">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden sticky top-6">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Account Reference</h2>
            </div>
            {(() => {
              const rows = [...localAccounts]
                .filter(a => a.tpid)
                .sort((a, b) => a.name.localeCompare(b.name));
              if (rows.length === 0) return (
                <p className="text-xs text-slate-400 dark:text-slate-500 px-4 py-6 text-center italic">No accounts imported yet.</p>
              );
              return (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Account Name</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">TPID</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Terr.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {(rows
                ).map(row => (
                  <tr
                    key={row.id}
                    onClick={() => setTpidInput(prev => {
                      const existing = prev.trim();
                      return existing ? `${existing}\n${row.tpid}` : String(row.tpid);
                    })}
                    title={`Add TPID ${row.tpid} to input`}
                    className="hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer"
                  >
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100 text-xs leading-snug font-medium">{row.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                      {row.tpid}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {row.territory_name ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              );
            })()}
          </div>
        </div>

      </div>{/* end flex row */}

      {/* ── VPN notice footer ────────────────────────────────────────────── */}
      <p className="mt-auto pt-4 pb-6 flex items-center justify-center gap-1 text-xs text-slate-400 dark:text-slate-500">
        <AlertTriangle size={11} className="shrink-0" />
        You need to be connected to VPN before importing opportunities and making syncs to MSX.
      </p>

      {/* ── Duplicate confirm dialog ─────────────────────────────────────── */}
      {pendingPayload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) { setPendingPayload(null); setDuplicateTitles([]); } }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Overwrite existing data?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  The following {duplicateTitles.length} opportunit{duplicateTitles.length !== 1 ? 'ies' : 'y'} already exist locally.
                  Re-importing will overwrite them and replace all their activities.
                </p>
              </div>
            </div>
            <ul className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3 flex flex-col gap-1 max-h-48 overflow-y-auto">
              {duplicateTitles.map((t, i) => (
                <li key={i} className="text-sm text-amber-800 dark:text-amber-300">· {t}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setPendingPayload(null); setDuplicateTitles([]); }}>Cancel</Button>
              <Button onClick={confirmOverwrite}>
                <Download size={14} /> Yes, overwrite
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
