import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET /api/milestones — filterable by territory_id, account_id, opportunity_id, on_team
router.get('/', (req: Request, res: Response) => {
  const { territory_id, account_id, opportunity_id, on_team } = req.query;

  let query = `
    SELECT om.*,
           o.title AS opportunity_title,
           a.name  AS account_name,
           t.name  AS territory_name
    FROM opportunity_milestones om
    JOIN opportunities o ON o.id = om.opportunity_id
    JOIN accounts      a ON a.id = o.account_id
    JOIN territories   t ON t.id = a.territory_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (territory_id)    { query += ' AND t.id = ?';               params.push(Number(territory_id)); }
  if (account_id)      { query += ' AND a.id = ?';               params.push(Number(account_id)); }
  if (opportunity_id)  { query += ' AND om.opportunity_id = ?';  params.push(Number(opportunity_id)); }
  if (on_team === '1') { query += ' AND om.on_team = 1'; }

  query += ' ORDER BY om.milestone_date ASC, om.id ASC';

  res.json(db.prepare(query).all(...params));
});

export default router;
