import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET /api/milestones — filterable by territory_id, account_id, opportunity_id, on_team, msx_id
router.get('/', (req: Request, res: Response) => {
  const { territory_id, account_id, opportunity_id, on_team, msx_id } = req.query;

  let query = `
    SELECT om.*,
           o.title      AS opportunity_title,
           o.account_id AS account_id,
           o.msx_id     AS opportunity_msx_id,
           a.name       AS account_name,
           t.name       AS territory_name
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
  if (msx_id)          { query += ' AND om.msx_id = ?';          params.push(String(msx_id)); }

  query += ' ORDER BY om.milestone_date ASC, om.id ASC';

  res.json(db.prepare(query).all(...params));
});

// PATCH /api/milestones/:id/on_team — toggle on_team flag
router.patch('/:id/on_team', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { on_team } = req.body as { on_team: 0 | 1 };
  if (on_team !== 0 && on_team !== 1) {
    res.status(400).json({ error: 'on_team must be 0 or 1' });
    return;
  }
  db.prepare('UPDATE opportunity_milestones SET on_team = ? WHERE id = ?').run(on_team, id);
  res.json({ id, on_team });
});

// GET /api/milestones/:id/activities — activities linked to a specific local milestone
router.get('/:id/activities', (req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT ac.*, a.name as account_name, t.name as territory_name,
           o.title as opportunity_title, o.msx_id as opportunity_msx_id,
           om.name as milestone_name, om.msx_id as milestone_msx_id
    FROM activities ac
    LEFT JOIN accounts a ON a.id = ac.account_id
    LEFT JOIN territories t ON t.id = a.territory_id
    LEFT JOIN opportunities o ON o.id = ac.opportunity_id
    LEFT JOIN opportunity_milestones om ON om.id = ac.milestone_id
    WHERE ac.milestone_id = ?
    ORDER BY ac.position ASC, ac.date DESC, ac.created_at DESC
  `).all(req.params.id);
  res.json(rows);
});

export default router;
