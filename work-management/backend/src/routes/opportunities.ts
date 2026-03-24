import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET all opportunities (optionally filtered by territory_id, account_id or status)
router.get('/', (req: Request, res: Response) => {
  const { territory_id, account_id, status } = req.query;
  let query = `
    SELECT o.*, a.name as account_name, t.name as territory_name,
           COUNT(ac.id) as activity_count
    FROM opportunities o
    LEFT JOIN accounts a ON a.id = o.account_id
    LEFT JOIN territories t ON t.id = a.territory_id
    LEFT JOIN activities ac ON ac.opportunity_id = o.id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (territory_id) { query += ' AND t.id = ?';        params.push(String(territory_id)); }
  if (account_id)   { query += ' AND o.account_id = ?'; params.push(String(account_id)); }
  if (status)       { query += ' AND o.status = ?';     params.push(String(status)); }
  query += ' GROUP BY o.id ORDER BY o.updated_at DESC';
  res.json(db.prepare(query).all(...params));
});

// GET single opportunity
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare(`
    SELECT o.*, a.name as account_name, t.name as territory_name
    FROM opportunities o
    LEFT JOIN accounts a ON a.id = o.account_id
    LEFT JOIN territories t ON t.id = a.territory_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Opportunity not found' });
  res.json(row);
});

// POST create opportunity
router.post('/', (req: Request, res: Response) => {
  const { account_id, title, description, link, status, next_steps } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const result = db.prepare(`
    INSERT INTO opportunities (account_id, title, description, link, status, next_steps)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(account_id, title.trim(), description ?? null, link ?? null, status ?? 'Active', next_steps ?? null);
  res.status(201).json(db.prepare('SELECT * FROM opportunities WHERE id = ?').get(result.lastInsertRowid));
});

// PUT update opportunity
router.put('/:id', (req: Request, res: Response) => {
  const { account_id, title, description, link, status, next_steps } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const info = db.prepare(`
    UPDATE opportunities SET account_id=?, title=?, description=?, link=?, status=?,
    next_steps=?, updated_at=datetime('now') WHERE id=?
  `).run(account_id, title.trim(), description ?? null, link ?? null, status ?? 'Active', next_steps ?? null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Opportunity not found' });
  res.json(db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id));
});

// DELETE opportunity
router.delete('/:id', (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Opportunity not found' });
  db.prepare('DELETE FROM activities WHERE opportunity_id = ?').run(req.params.id);
  db.prepare('DELETE FROM opportunities WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
