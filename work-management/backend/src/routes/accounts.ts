import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET all accounts (optionally filtered by territory_id)
router.get('/', (req: Request, res: Response) => {
  const { territory_id } = req.query;
  const rows = territory_id
    ? db.prepare(`
        SELECT a.*, t.name as territory_name,
               COUNT(DISTINCT o.id) as opportunity_count,
               COUNT(DISTINCT ac.id) as activity_count
        FROM accounts a
        LEFT JOIN territories t ON t.id = a.territory_id
        LEFT JOIN opportunities o ON o.account_id = a.id
        LEFT JOIN activities ac ON ac.account_id = a.id
        WHERE a.territory_id = ?
        GROUP BY a.id
        ORDER BY a.name
      `).all(String(territory_id))
    : db.prepare(`
        SELECT a.*, t.name as territory_name,
               COUNT(DISTINCT o.id) as opportunity_count,
               COUNT(DISTINCT ac.id) as activity_count
        FROM accounts a
        LEFT JOIN territories t ON t.id = a.territory_id
        LEFT JOIN opportunities o ON o.account_id = a.id
        LEFT JOIN activities ac ON ac.account_id = a.id
        GROUP BY a.id
        ORDER BY t.name, a.name
      `).all();
  res.json(rows);
});

// GET single account
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare(`
    SELECT a.*, t.name as territory_name
    FROM accounts a
    LEFT JOIN territories t ON t.id = a.territory_id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Account not found' });
  res.json(row);
});

// POST create account
router.post('/', (req: Request, res: Response) => {
  const { territory_id, name, website, notes } = req.body;
  if (!territory_id) return res.status(400).json({ error: 'territory_id is required' });
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare(
    'INSERT INTO accounts (territory_id, name, website, notes) VALUES (?, ?, ?, ?)'
  ).run(territory_id, name.trim(), website ?? null, notes ?? null);
  const created = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT update account
router.put('/:id', (req: Request, res: Response) => {
  const { territory_id, name, website, notes } = req.body;
  if (!territory_id) return res.status(400).json({ error: 'territory_id is required' });
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const info = db.prepare(`
    UPDATE accounts SET territory_id = ?, name = ?, website = ?, notes = ?,
    updated_at = datetime('now') WHERE id = ?
  `).run(territory_id, name.trim(), website ?? null, notes ?? null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Account not found' });
  res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id));
});

// PATCH plan_of_action — lightweight endpoint so AccountDetail can save without full PUT
router.patch('/:id/plan-of-action', (req: Request, res: Response) => {
  const { plan_of_action } = req.body;
  const info = db.prepare(`
    UPDATE accounts SET plan_of_action = ?, updated_at = datetime('now') WHERE id = ?
  `).run(plan_of_action ?? null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Account not found' });
  res.json({ ok: true });
});

// DELETE account
router.delete('/:id', (req: Request, res: Response) => {
  const info = db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Account not found' });
  res.status(204).end();
});

export default router;
