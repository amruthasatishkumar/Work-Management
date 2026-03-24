import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router({ mergeParams: true });

// GET all next steps for an opportunity
router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT * FROM opportunity_next_steps
    WHERE opportunity_id = ?
    ORDER BY created_at ASC
  `).all(req.params.id);
  res.json(rows);
});

// POST create next step
router.post('/', (req: Request, res: Response) => {
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const result = db.prepare(
    'INSERT INTO opportunity_next_steps (opportunity_id, title) VALUES (?, ?)'
  ).run(req.params.id, title.trim());
  res.status(201).json(
    db.prepare('SELECT * FROM opportunity_next_steps WHERE id = ?').get(result.lastInsertRowid)
  );
});

// PATCH toggle done + record completion date
router.patch('/:stepId', (req: Request, res: Response) => {
  const { done, completion_date } = req.body;
  const info = db.prepare(
    'UPDATE opportunity_next_steps SET done = ?, completion_date = ? WHERE id = ? AND opportunity_id = ?'
  ).run(done ? 1 : 0, completion_date ?? null, req.params.stepId, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Next step not found' });
  res.json(db.prepare('SELECT * FROM opportunity_next_steps WHERE id = ?').get(req.params.stepId));
});

// DELETE next step
router.delete('/:stepId', (req: Request, res: Response) => {
  const info = db.prepare(
    'DELETE FROM opportunity_next_steps WHERE id = ? AND opportunity_id = ?'
  ).run(req.params.stepId, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Next step not found' });
  res.status(204).end();
});

export default router;
