import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  // Single query for all counts — avoids 8 sequential synchronous DB calls
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM territories)                                       AS territories,
      (SELECT COUNT(*) FROM accounts)                                          AS accounts,
      (SELECT COUNT(*) FROM opportunities)                                     AS opportunities_total,
      (SELECT COUNT(*) FROM opportunities WHERE status='Active')               AS opportunities_active,
      (SELECT COUNT(*) FROM activities)                                        AS activities_total,
      (SELECT COUNT(*) FROM activities WHERE status IN ('To Do','In Progress')) AS activities_upcoming,
      (SELECT COUNT(*) FROM se_work WHERE status='Not Started')                AS se_not_started,
      (SELECT COUNT(*) FROM se_work WHERE status='In Progress')                AS se_inprogress
  `).get() as any;

  // Recent activities (last 10)
  const recent_activities = db.prepare(`
    SELECT ac.*, a.name as account_name, o.title as opportunity_title
    FROM activities ac
    LEFT JOIN accounts a ON a.id = ac.account_id
    LEFT JOIN opportunities o ON o.id = ac.opportunity_id
    ORDER BY ac.created_at DESC, ac.date DESC
    LIMIT 10
  `).all();

  // Remaining activities (next 30 days)
  const remaining_activities = db.prepare(`
    SELECT ac.*, a.name as account_name, o.title as opportunity_title
    FROM activities ac
    LEFT JOIN accounts a ON a.id = ac.account_id
    LEFT JOIN opportunities o ON o.id = ac.opportunity_id
    WHERE ac.status IN ('To Do','In Progress')
    ORDER BY ac.date ASC
    LIMIT 10
  `).all();

  // Active opportunities
  const active_opportunities = db.prepare(`
    SELECT o.*, a.name as account_name, t.name as territory_name
    FROM opportunities o
    LEFT JOIN accounts a ON a.id = o.account_id
    LEFT JOIN territories t ON t.id = a.territory_id
    WHERE o.status = 'Active'
    ORDER BY o.updated_at DESC
    LIMIT 10
  `).all();

  res.json({
    stats: {
      territories: stats.territories,
      accounts: stats.accounts,
      opportunities_total: stats.opportunities_total,
      opportunities_active: stats.opportunities_active,
      activities_total: stats.activities_total,
      activities_upcoming: stats.activities_upcoming,
      se_not_started: stats.se_not_started,
      se_inprogress: stats.se_inprogress,
    },
    recent_activities,
    remaining_activities,
    active_opportunities,
  });
});

export default router;
