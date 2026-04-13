import { Router, Request, Response } from 'express';
import db from '../db/database';
import { getD365Token } from '../services/msxClient';

const router = Router();

// ─── GET /api/msx/token-status ────────────────────────────────────────────────
// Returns Azure CLI token validity and logged-in user.
// Frontend uses this to show the "Valid for X min · {user}" badge.
router.get('/token-status', (_req: Request, res: Response) => {
  try {
    const token = getD365Token();
    res.json({
      valid: true,
      accessToken: token.accessToken,
      minutesRemaining: token.minutesRemaining,
      expiresOn: token.expiresOn,
      userId: token.userId,
    });
  } catch (err: any) {
    res.json({ valid: false, error: err.message });
  }
});

// ─── POST /api/msx/check-existing ───────────────────────────────────────────
// Returns titles of opportunities that already exist locally (matched by msx_id).
router.post('/check-existing', (req: Request, res: Response) => {
  const { oppMsxIds } = req.body;
  if (!Array.isArray(oppMsxIds) || oppMsxIds.length === 0) {
    return res.json({ existing: [] });
  }
  const placeholders = oppMsxIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT title FROM opportunities WHERE msx_id IN (${placeholders})`
  ).all(...oppMsxIds) as { title: string }[];
  res.json({ existing: rows.map(r => r.title) });
});

// ─── POST /api/msx/import ─────────────────────────────────────────────────────
// Body: {
//   territoryId: number,
//   accounts: [{
//     msxId: string, name: string, website: string | null, tpid: number,
//     opportunities: [{
//       msxId: string, title: string, description: string | null, status: string,
//       estimatedCloseDate: string | null,
//       milestones: [{ msxId: string, milestoneNumber: string|null, name: string|null, ... }],
//       activities: [{
//         msxId: string, subject: string, type: string, status: string,
//         date: string | null, completedDate: string | null,
//         milestoneMsxId: string | null
//       }]
//     }]
//   }]
// }
router.post('/import', (req: Request, res: Response) => {
  const { territoryId, accounts } = req.body;

  if (!territoryId || !Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: 'territoryId and accounts[] are required' });
  }

  // Verify territory exists
  const territory = db.prepare('SELECT id FROM territories WHERE id = ?').get(territoryId);
  if (!territory) {
    return res.status(400).json({ error: `Territory ${territoryId} not found` });
  }

  let importedAccounts = 0;
  let importedOpportunities = 0;
  let importedActivities = 0;

  try {
    db.exec('BEGIN');
    try {
      for (const acc of accounts) {
        // Upsert account by msx_id
        const existingAcc: any = db.prepare('SELECT id FROM accounts WHERE msx_id = ?').get(acc.msxId);
        let accountId: number;

        if (existingAcc) {
          db.prepare(
            'UPDATE accounts SET name = ?, website = ?, territory_id = ?, tpid = ?, updated_at = datetime(\'now\') WHERE msx_id = ?'
          ).run(acc.name, acc.website ?? null, territoryId, acc.tpid ?? null, acc.msxId);
          accountId = existingAcc.id;
        } else {
          const result: any = db.prepare(
            'INSERT INTO accounts (territory_id, name, website, msx_id, tpid) VALUES (?, ?, ?, ?, ?)'
          ).run(territoryId, acc.name, acc.website ?? null, acc.msxId, acc.tpid ?? null);
          accountId = result.lastInsertRowid;
          importedAccounts++;
        }

        for (const opp of acc.opportunities ?? []) {
          // Upsert opportunity by msx_id
          const existingOpp: any = db.prepare('SELECT id FROM opportunities WHERE msx_id = ?').get(opp.msxId);
          let oppId: number;

          if (existingOpp) {
            db.prepare(
              'UPDATE opportunities SET title = ?, description = ?, status = ?, account_id = ?, link = ?, solution_play = ?, updated_at = datetime(\'now\') WHERE msx_id = ?'
            ).run(opp.title, opp.description ?? null, opp.status, accountId, opp.link ?? null, opp.solutionPlay ?? null, opp.msxId);
            oppId = existingOpp.id;
            // Remove old MSX activities for this opp so we re-import fresh
            db.prepare('DELETE FROM activities WHERE opportunity_id = ? AND account_id = ? AND msx_id IS NOT NULL').run(oppId, accountId);
          } else {
            const result: any = db.prepare(
              'INSERT INTO opportunities (account_id, title, description, status, link, msx_id, solution_play) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(accountId, opp.title, opp.description ?? null, opp.status, opp.link ?? null, opp.msxId, opp.solutionPlay ?? null);
            oppId = result.lastInsertRowid;
            importedOpportunities++;
          }

          // Upsert milestones and build msxId -> localId map for activity linkage
          const milestoneIdMap = new Map<string, number>();
          for (const m of opp.milestones ?? []) {
            if (!m.msxId) continue;
            const existingM: any = db.prepare('SELECT id FROM opportunity_milestones WHERE msx_id = ?').get(m.msxId);
            if (existingM) {
              db.prepare(
                `UPDATE opportunity_milestones SET milestone_number=?,name=?,workload=?,commitment=?,category=?,monthly_use=?,milestone_date=?,status=?,owner=?,synced_at=datetime('now') WHERE msx_id=?`
              ).run(m.milestoneNumber ?? null, m.name ?? null, m.workload ?? null, m.commitment ?? null, m.category ?? null, m.monthlyUse ?? null, m.milestoneDate ?? null, m.status ?? null, m.owner ?? null, m.msxId);
              milestoneIdMap.set(m.msxId, existingM.id);
            } else {
              const mResult: any = db.prepare(
                'INSERT INTO opportunity_milestones (opportunity_id,msx_id,milestone_number,name,workload,commitment,category,monthly_use,milestone_date,status,owner,on_team) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)'
              ).run(oppId, m.msxId, m.milestoneNumber ?? null, m.name ?? null, m.workload ?? null, m.commitment ?? null, m.category ?? null, m.monthlyUse ?? null, m.milestoneDate ?? null, m.status ?? null, m.owner ?? null);
              milestoneIdMap.set(m.msxId, mResult.lastInsertRowid);
            }
          }

          // Insert activities (always fresh — old MSX ones deleted above or this is new opp)
          for (const act of opp.activities ?? []) {
            const actDate = act.date ?? new Date().toISOString().split('T')[0];
            const localMilestoneId = act.milestoneMsxId ? (milestoneIdMap.get(act.milestoneMsxId) ?? null) : null;
            db.prepare(
              `INSERT INTO activities (account_id, opportunity_id, milestone_id, type, purpose, date, status, completed_date, msx_id, msx_entity_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              accountId,
              oppId,
              localMilestoneId,
              act.type,
              act.subject,
              actDate,
              act.status,
              act.completedDate ?? null,
              act.msxId ?? null,
              act.entityType ?? 'task',
            );
            importedActivities++;
          }

          // Upsert comments from msp_forecastcommentsjsonfield
          for (const comment of opp.comments ?? []) {
            if (!comment.content?.trim()) continue;
            const existingComment: any = comment.msxId
              ? db.prepare('SELECT id FROM opportunity_comments WHERE msx_id = ?').get(comment.msxId)
              : null;
            // Parse locale-style date strings like "1/15/2026, 2:57:02 PM"
            const createdAt = (() => {
              try {
                const d = new Date(comment.createdAt);
                return isNaN(d.getTime()) ? null : d.toISOString().replace('T', ' ').substring(0, 19);
              } catch { return null; }
            })();
            if (existingComment) {
              db.prepare('UPDATE opportunity_comments SET content = ? WHERE id = ?')
                .run(comment.content.trim(), existingComment.id);
            } else {
              db.prepare(
                `INSERT INTO opportunity_comments (opportunity_id, content, msx_id${
                  createdAt ? ', created_at' : ''
                }) VALUES (?, ?, ?${
                  createdAt ? ', ?' : ''
                })`
              ).run(...([oppId, comment.content.trim(), comment.msxId ?? null].concat(createdAt ? [createdAt] : []) as any[]));
            }
          }
        }
      }
      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
    res.json({
      success: true,
      imported: {
        accounts: importedAccounts,
        opportunities: importedOpportunities,
        activities: importedActivities,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/msx/refresh-opp ────────────────────────────────────────────────
// Live-sync: upserts fresh comments + MSX-linked activities for one opp.
// Locally-created activities (no msx_id) are never touched.
router.post('/refresh-opp', (req: Request, res: Response) => {
  const { localOppId, comments, activities, milestones, solutionPlay } = req.body;
  if (!localOppId) return res.status(400).json({ error: 'localOppId required' });

  const opp = db.prepare('SELECT account_id FROM opportunities WHERE id = ?').get(localOppId) as any;
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
  const accountId = opp.account_id;

  try {
    db.exec('BEGIN');
    try {
      // Update solution_play on the opportunity if provided
      if (solutionPlay !== undefined) {
        db.prepare('UPDATE opportunities SET solution_play = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .run(solutionPlay ?? null, localOppId);
      }
      for (const comment of (comments ?? [])) {
        if (!comment.content?.trim()) continue;
        const existing: any = comment.msxId
          ? db.prepare('SELECT id FROM opportunity_comments WHERE msx_id = ?').get(comment.msxId)
          : null;
        const createdAt = (() => {
          try { const d = new Date(comment.createdAt); return isNaN(d.getTime()) ? null : d.toISOString().replace('T', ' ').substring(0, 19); } catch { return null; }
        })();
        if (existing) {
          db.prepare('UPDATE opportunity_comments SET content = ? WHERE id = ?')
            .run(comment.content.trim(), existing.id);
        } else {
          db.prepare(
            `INSERT INTO opportunity_comments (opportunity_id, content, msx_id${createdAt ? ', created_at' : ''}) VALUES (?, ?, ?${createdAt ? ', ?' : ''})`,
          ).run(...([localOppId, comment.content.trim(), comment.msxId ?? null].concat(createdAt ? [createdAt] : []) as any[]));
        }
      }

      for (const act of (activities ?? [])) {
        if (!act.msxId) continue;
        const existing: any = db.prepare('SELECT id FROM activities WHERE msx_id = ?').get(act.msxId);
        const actDate = act.date ?? new Date().toISOString().split('T')[0];
        // Resolve milestone_id if milestoneMsxId provided
        const localMilestoneId = act.milestoneMsxId
          ? (db.prepare('SELECT id FROM opportunity_milestones WHERE msx_id = ?').get(act.milestoneMsxId) as any)?.id ?? null
          : null;
        if (existing) {
          db.prepare('UPDATE activities SET type = ?, purpose = ?, date = ?, status = ?, completed_date = ?, milestone_id = COALESCE(?, milestone_id) WHERE msx_id = ?')
            .run(act.type, act.subject, actDate, act.status, act.completedDate ?? null, localMilestoneId, act.msxId);
        } else {
          db.prepare(
            'INSERT INTO activities (account_id, opportunity_id, milestone_id, type, purpose, date, status, completed_date, msx_id, msx_entity_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ).run(accountId, localOppId, localMilestoneId, act.type, act.subject, actDate, act.status, act.completedDate ?? null, act.msxId, act.entityType ?? 'task');
        }
      }

      for (const m of (milestones ?? [])) {
        if (!m.msxId) continue;
        const existingM: any = db.prepare('SELECT id FROM opportunity_milestones WHERE msx_id = ?').get(m.msxId);
        if (existingM) {
          db.prepare(
            `UPDATE opportunity_milestones SET milestone_number=?,name=?,workload=?,commitment=?,category=?,monthly_use=?,milestone_date=?,status=?,owner=?,synced_at=datetime('now') WHERE msx_id=?`
          ).run(m.milestoneNumber ?? null, m.name ?? null, m.workload ?? null, m.commitment ?? null, m.category ?? null, m.monthlyUse ?? null, m.milestoneDate ?? null, m.status ?? null, m.owner ?? null, m.msxId);
        } else {
          db.prepare(
            'INSERT INTO opportunity_milestones (opportunity_id,msx_id,milestone_number,name,workload,commitment,category,monthly_use,milestone_date,status,owner,on_team) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)'
          ).run(localOppId, m.msxId, m.milestoneNumber ?? null, m.name ?? null, m.workload ?? null, m.commitment ?? null, m.category ?? null, m.monthlyUse ?? null, m.milestoneDate ?? null, m.status ?? null, m.owner ?? null);
        }
      }

      db.exec('COMMIT');
      res.json({ ok: true });
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Backend D365 fetch helper ───────────────────────────────────────────────
const D365_BASE_BE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';

async function fetchOppByIdBackend(
  accessToken: string,
  oppId: string,
): Promise<{ account: any; tpid: number; opp: any }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Prefer: 'odata.maxpagesize=250',
  };

  const oppRes = await fetch(`${D365_BASE_BE}/opportunities(${oppId})`, { headers });
  if (!oppRes.ok) {
    const body: any = await oppRes.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `D365 returned HTTP ${oppRes.status} for opportunity ${oppId}`);
  }
  const opp: any = await oppRes.json();

  let account: any = null;
  let tpid = 0;
  const accountId = opp._parentaccountid_value;
  if (accountId) {
    const accRes = await fetch(
      `${D365_BASE_BE}/accounts(${accountId})?$select=accountid,name,websiteurl,msp_mstopparentid`,
      { headers },
    );
    if (accRes.ok) {
      const acc: any = await accRes.json();
      account = { accountid: acc.accountid, name: acc.name, websiteurl: acc.websiteurl ?? null };
      tpid = acc.msp_mstopparentid ?? 0;
    }
  }

  const actRes = await fetch(
    `${D365_BASE_BE}/activitypointers?$filter=_regardingobjectid_value eq '${oppId}'&$select=activityid,subject,activitytypecode,statecode,scheduledstart,actualend`,
    { headers },
  );
  const activities = actRes.ok ? ((await actRes.json() as any).value ?? []) : [];

  let annotations: any[] = [];
  try {
    const commentsRes = await fetch(
      `${D365_BASE_BE}/opportunities(${oppId})/msp_forecastcommentsjsonfield`,
      { headers },
    );
    if (commentsRes.ok) {
      const j: any = await commentsRes.json();
      annotations = JSON.parse(j.value ?? '[]');
    }
  } catch { /* skip */ }

  return { account, tpid, opp: { ...opp, activities, annotations } };
}

// ─── POST /api/msx/fetch-opp ─────────────────────────────────────────────────
router.post('/fetch-opp', async (req: Request, res: Response) => {
  const { oppId } = req.body;
  if (!oppId) return res.status(400).json({ error: 'oppId is required' });
  try {
    const token = getD365Token();
    const result = await fetchOppByIdBackend(token.accessToken, oppId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/msx/deal-team-opps ────────────────────────────────────────────
const DEAL_TEAM_TEMPLATE_ID_BE = 'cc923a9d-7651-e311-9405-00155db3ba1e';

router.post('/deal-team-opps', async (req: Request, res: Response) => {
  try {
    const token = getD365Token();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token.accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'odata.maxpagesize=250',
    };

    const whoRes = await fetch(`${D365_BASE_BE}/WhoAmI()`, { headers });
    if (!whoRes.ok) {
      const body: any = await whoRes.json().catch(() => ({}));
      return res.status(500).json({ error: body?.error?.message ?? `WhoAmI failed with HTTP ${whoRes.status}` });
    }
    const { UserId } = (await whoRes.json()) as any;
    const userId = UserId.toLowerCase().replace(/[{}]/g, '');

    const fetchXml = `<fetch distinct="true" no-lock="true">
      <entity name="team">
        <attribute name="teamid"/>
        <attribute name="regardingobjectid"/>
        <filter type="and">
          <condition attribute="teamtype" operator="eq" value="1"/>
          <condition attribute="teamtemplateid" operator="eq" value="{${DEAL_TEAM_TEMPLATE_ID_BE}}"/>
        </filter>
        <link-entity name="teammembership" from="teamid" to="teamid" link-type="inner" alias="tm">
          <filter type="and">
            <condition attribute="systemuserid" operator="eq" value="${userId}"/>
          </filter>
        </link-entity>
      </entity>
    </fetch>`;

    const teamsRes = await fetch(`${D365_BASE_BE}/teams?fetchXml=${encodeURIComponent(fetchXml)}`, { headers });
    if (!teamsRes.ok) {
      const body: any = await teamsRes.json().catch(() => ({}));
      return res.status(500).json({ error: body?.error?.message ?? 'Could not fetch deal team memberships.' });
    }
    const teamsJson: any = await teamsRes.json();

    const oppIds: string[] = Array.from(new Set(
      (teamsJson.value ?? [])
        .map((t: any) => String(t._regardingobjectid_value ?? '').replace(/[{}]/g, '').toLowerCase())
        .filter(Boolean),
    ));

    if (oppIds.length === 0) return res.json([]);

    const results = await Promise.all(
      oppIds.map(id => fetchOppByIdBackend(token.accessToken, id).catch(() => null)),
    );
    res.json(results.filter(Boolean));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

