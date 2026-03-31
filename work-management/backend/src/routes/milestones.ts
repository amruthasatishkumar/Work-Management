import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET /api/milestones
// Query params: territory_id, account_id, opportunity_id, on_team (1 = only mine)
router.get('/', (req: Request, res: Response) => {
  const { territory_id, account_id, opportunity_id, on_team } = req.query;

  let query = `
    SELECT
      m.id, m.msx_id, m.milestone_number, m.name, m.workload, m.commitment,
      m.category, m.monthly_use, m.milestone_date, m.status, m.owner,
      m.on_team, m.synced_at,
      o.id   AS opportunity_id,
      o.title AS opportunity_title,
      a.id   AS account_id,
      a.name AS account_name,
      t.id   AS territory_id,
      t.name AS territory_name
    FROM opportunity_milestones m
    JOIN opportunities o ON o.id = m.opportunity_id
    JOIN accounts a ON a.id = o.account_id
    JOIN territories t ON t.id = a.territory_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (territory_id)  { query += ' AND t.id = ?';         params.push(String(territory_id)); }
  if (account_id)    { query += ' AND a.id = ?';         params.push(String(account_id)); }
  if (opportunity_id){ query += ' AND o.id = ?';         params.push(String(opportunity_id)); }
  if (on_team === '1'){ query += ' AND m.on_team = 1'; }

  query += ' ORDER BY CASE WHEN m.milestone_date IS NULL THEN 1 ELSE 0 END, m.milestone_date ASC';

  res.json(db.prepare(query).all(...params));
});

export default router;
