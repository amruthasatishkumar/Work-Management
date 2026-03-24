import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET all SE work items
router.get('/', (req: Request, res: Response) => {
  const { status } = req.query;
  let query = 'SELECT * FROM se_work WHERE 1=1';
  const params: string[] = [];
  if (status) { query += ' AND status = ?'; params.push(String(status)); }
  query += ' ORDER BY position ASC, created_at ASC';
  res.json(db.prepare(query).all(...params));
});

// POST create SE work item
router.post('/', (req: Request, res: Response) => {
  const { title, due_date, completion_date, status } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const result = db.prepare(`
    INSERT INTO se_work (title, due_date, completion_date, status)
    VALUES (?, ?, ?, ?)
  `).run(title.trim(), due_date ?? null, completion_date ?? null, status ?? 'Not Started');
  res.status(201).json(db.prepare('SELECT * FROM se_work WHERE id = ?').get(result.lastInsertRowid));
});

// PATCH status and position (for Kanban drag-drop)
router.patch('/:id/status', (req: Request, res: Response) => {
  const { status, position } = req.body;
  const current = db.prepare('SELECT * FROM se_work WHERE id = ?').get(req.params.id) as any;
  if (!current) return res.status(404).json({ error: 'Item not found' });
  // Auto-manage completion_date
  let completion_date = current.completion_date;
  if (status === 'Completed' && !completion_date) {
    completion_date = new Date().toISOString().split('T')[0];
  } else if (status !== 'Completed') {
    completion_date = null;
  }
  db.prepare(`
    UPDATE se_work SET status=?, position=?, completion_date=?, updated_at=datetime('now') WHERE id=?
  `).run(status, position ?? 0, completion_date, req.params.id);
  res.json(db.prepare('SELECT * FROM se_work WHERE id = ?').get(req.params.id));
});

// PUT update SE work item
router.put('/:id', (req: Request, res: Response) => {
  const { title, due_date, completion_date, status } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const info = db.prepare(`
    UPDATE se_work SET title=?, due_date=?, completion_date=?, status=?, updated_at=datetime('now')
    WHERE id=?
  `).run(title.trim(), due_date ?? null, completion_date ?? null, status ?? 'Not Started', req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.json(db.prepare('SELECT * FROM se_work WHERE id = ?').get(req.params.id));
});

// DELETE SE work item
router.delete('/:id', (req: Request, res: Response) => {
  const info = db.prepare('DELETE FROM se_work WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.status(204).end();
});

export default router;
