import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET all tasks ordered by status column position then position within column
router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT * FROM tasks
    ORDER BY
      CASE status WHEN 'Todo' THEN 0 WHEN 'In Progress' THEN 1 WHEN 'Done' THEN 2 END,
      position ASC, created_at ASC
  `).all();
  res.json(rows);
});

// GET single task
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Task not found' });
  res.json(row);
});

// POST create task
router.post('/', (req: Request, res: Response) => {
  const { title, description, status, priority, due_date } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  // Place at the end of the column
  const maxPos = db.prepare(
    "SELECT COALESCE(MAX(position), -1) as m FROM tasks WHERE status = ?"
  ).get(status ?? 'Todo') as { m: number };
  const result = db.prepare(`
    INSERT INTO tasks (title, description, status, priority, due_date, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title.trim(), description ?? null, status ?? 'Todo', priority ?? 'Medium', due_date ?? null, maxPos.m + 1);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
});

// PUT update task (including status change for drag-and-drop)
router.put('/:id', (req: Request, res: Response) => {
  const { title, description, status, priority, due_date, position } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const info = db.prepare(`
    UPDATE tasks SET title=?, description=?, status=?, priority=?, due_date=?,
    position=?, updated_at=datetime('now') WHERE id=?
  `).run(title.trim(), description ?? null, status ?? 'Todo', priority ?? 'Medium', due_date ?? null, position ?? 0, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Task not found' });
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

// PATCH — quick status update (for drag-and-drop)
router.patch('/:id/status', (req: Request, res: Response) => {
  const { status, position } = req.body;
  const info = db.prepare(`
    UPDATE tasks SET status=?, position=?, updated_at=datetime('now') WHERE id=?
  `).run(status, position ?? 0, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Task not found' });
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

// DELETE task
router.delete('/:id', (req: Request, res: Response) => {
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});

export default router;
