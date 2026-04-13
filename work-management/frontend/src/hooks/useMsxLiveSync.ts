import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
const INTERVAL_MS = 2 * 60 * 1000;

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
const FV = '@OData.Community.Display.V1.FormattedValue';

function mapActivityType(code: string): string {
  return ['email', 'phonecall', 'appointment', 'teams_meeting'].includes(code) ? 'Meeting' : 'Other';
}

function mapActivityStatus(statecode: number): string {
  if (statecode === 1) return 'Completed';
  if (statecode === 2) return 'Blocked';
  return 'To Do';
}

export function useMsxLiveSync(oppId: number | null, oppMsxId: string | null) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function sync() {
    if (!oppId || !oppMsxId) return;
    try {
      const tokenData = await api.msx.tokenStatus().catch(() => null);
      if (!tokenData?.valid) return;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      };
      const cleanId = oppMsxId.replace(/[{}]/g, '');

      // Fetch comments from msp_forecastcommentsjsonfield
      let comments: any[] = [];
      try {
        const r = await fetch(
          `${D365_BASE}/opportunities(${cleanId})/msp_forecastcommentsjsonfield`,
          { headers }
        );
        if (r.ok) {
          const j = await r.json();
          const raw: any[] = JSON.parse(j.value ?? '[]');
          comments = raw.map(c => ({
            content: c.comment,
            msxId: `${c.userId}:${c.modifiedOn}`,
            createdAt: c.modifiedOn,
          }));
        }
      } catch { /* skip comments if unavailable */ }

      // Fetch activities from D365
      let activities: any[] = [];
      try {
        const r = await fetch(
          `${D365_BASE}/activitypointers?$filter=_regardingobjectid_value eq '${cleanId}'&$select=activityid,subject,activitytypecode,statecode,scheduledstart,actualend`,
          { headers }
        );
        if (r.ok) {
          const j = await r.json();
          activities = (j.value ?? []).map((a: any) => ({
            msxId: a.activityid,
            subject: a.subject ?? '(no subject)',
            type: mapActivityType(a.activitytypecode),
            status: mapActivityStatus(a.statecode),
            date: a.scheduledstart ? a.scheduledstart.split('T')[0] : new Date().toISOString().split('T')[0],
            completedDate: a.actualend ? a.actualend.split('T')[0] : null,
            entityType: a.activitytypecode,
          }));
        }
      } catch { /* skip activities if unavailable */ }

      // Fetch milestones from D365 and save to local DB for AI assistant
      let milestones: any[] = [];
      try {
        // Request FormattedValue annotations so option-set fields return labels not raw integers
        const milestoneHeaders = { ...headers, 'Prefer': 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' };
        const r = await fetch(
          `${D365_BASE}/msp_engagementmilestones?$filter=_msp_opportunityid_value eq '${cleanId}'&$select=${MILESTONE_SELECT}&$orderby=msp_milestonedate`,
          { headers: milestoneHeaders }
        );
        if (r.ok) {
          const j = await r.json();
          milestones = (j.value ?? []).map((m: any) => ({
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
        }
      } catch { /* skip milestones if unavailable */ }

      await api.msx.refreshOpp({ localOppId: oppId, comments, activities, milestones });

      // Invalidate both queries so UI re-reads from DB
      qc.invalidateQueries({ queryKey: queryKeys.opportunityComments.list(oppId) });
      qc.invalidateQueries({ queryKey: queryKeys.activities.all({ opportunity_id: oppId }) });
    } catch { /* silent — never crash the page */ }
  }

  useEffect(() => {
    if (!oppId || !oppMsxId) return;
    sync();
    timer.current = setInterval(sync, INTERVAL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [oppId, oppMsxId]); // eslint-disable-line react-hooks/exhaustive-deps
}
