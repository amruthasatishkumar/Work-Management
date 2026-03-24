import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const territories = db.prepare('SELECT COUNT(*) as count FROM territories').get() as { count: number };
  const accounts    = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number };
  const opps_total  = db.prepare('SELECT COUNT(*) as count FROM opportunities').get() as { count: number };
  const opps_active = db.prepare("SELECT COUNT(*) as count FROM opportunities WHERE status='Active'").get() as { count: number };
  const acts_total  = db.prepare('SELECT COUNT(*) as count FROM activities').get() as { count: number };
  const acts_upcoming = db.prepare("SELECT COUNT(*) as count FROM activities WHERE status IN ('To Do','In Progress')").get() as { count: number };
  const se_not_started = db.prepare("SELECT COUNT(*) as count FROM se_work WHERE status='Not Started'").get() as { count: number };
  const se_inprogress   = db.prepare("SELECT COUNT(*) as count FROM se_work WHERE status='In Progress'").get() as { count: number };

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
      territories: territories.count,
      accounts: accounts.count,
      opportunities_total: opps_total.count,
      opportunities_active: opps_active.count,
      activities_total: acts_total.count,
      activities_upcoming: acts_upcoming.count,
      se_not_started: se_not_started.count,
      se_inprogress: se_inprogress.count,
    },
    recent_activities,
    remaining_activities,
    active_opportunities,
  });
});

export default router;
