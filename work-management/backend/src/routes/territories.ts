import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET all territories (with account count)
router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT t.*, COUNT(a.id) as account_count
    FROM territories t
    LEFT JOIN accounts a ON a.territory_id = t.id
    GROUP BY t.id
    ORDER BY t.name
  `).all();
  res.json(rows);
});

// GET single territory
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM territories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Territory not found' });
  res.json(row);
});

// POST create territory
router.post('/', (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare(
    'INSERT INTO territories (name, description) VALUES (?, ?)'
  ).run(name.trim(), description ?? null);
  const created = db.prepare('SELECT * FROM territories WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT update territory
router.put('/:id', (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const info = db.prepare(
    'UPDATE territories SET name = ?, description = ? WHERE id = ?'
  ).run(name.trim(), description ?? null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Territory not found' });
  res.json(db.prepare('SELECT * FROM territories WHERE id = ?').get(req.params.id));
});

// DELETE territory
router.delete('/:id', (req: Request, res: Response) => {
  const info = db.prepare('DELETE FROM territories WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Territory not found' });
  res.status(204).end();
});

export default router;
