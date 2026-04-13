import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

// GET all activities (filterable by account_id, opportunity_id, milestone_id, type, status)
router.get('/', (req: Request, res: Response) => {
  const { account_id, opportunity_id, milestone_id, type, status } = req.query;
  let query = `
    SELECT ac.*, a.name as account_name, t.name as territory_name,
           o.title as opportunity_title, o.msx_id as opportunity_msx_id,
           om.name as milestone_name, om.msx_id as milestone_msx_id
    FROM activities ac
    LEFT JOIN accounts a ON a.id = ac.account_id
    LEFT JOIN territories t ON t.id = a.territory_id
    LEFT JOIN opportunities o ON o.id = ac.opportunity_id
    LEFT JOIN opportunity_milestones om ON om.id = ac.milestone_id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (account_id)     { query += ' AND ac.account_id = ?';     params.push(String(account_id)); }
  if (opportunity_id) { query += ' AND ac.opportunity_id = ?'; params.push(String(opportunity_id)); }
  if (milestone_id)   { query += ' AND ac.milestone_id = ?';   params.push(String(milestone_id)); }
  if (type)           { query += ' AND ac.type = ?';           params.push(String(type)); }
  if (status)         { query += ' AND ac.status = ?';         params.push(String(status)); }
  query += ' ORDER BY ac.position ASC, ac.date DESC, ac.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// GET single activity
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare(`
    SELECT ac.*, a.name as account_name, t.name as territory_name,
           o.title as opportunity_title, o.msx_id as opportunity_msx_id,
           om.name as milestone_name, om.msx_id as milestone_msx_id
    FROM activities ac
    LEFT JOIN accounts a ON a.id = ac.account_id
    LEFT JOIN territories t ON t.id = a.territory_id
    LEFT JOIN opportunities o ON o.id = ac.opportunity_id
    LEFT JOIN opportunity_milestones om ON om.id = ac.milestone_id
    WHERE ac.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Activity not found' });
  res.json(row);
});

// POST create activity
router.post('/', (req: Request, res: Response) => {
  const { account_id, opportunity_id, milestone_id, type, purpose, date, due_date, status, notes, completed_date } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });
  if (!type?.trim()) return res.status(400).json({ error: 'type is required' });
  if (!purpose?.trim()) return res.status(400).json({ error: 'purpose is required' });
  if (!date?.trim()) return res.status(400).json({ error: 'date is required' });
  const resolvedStatus = status ?? 'To Do';
  const resolvedCompletedDate = completed_date ?? (resolvedStatus === 'Completed' ? new Date().toISOString().split('T')[0] : null);
  const result = db.prepare(`
    INSERT INTO activities (account_id, opportunity_id, milestone_id, type, purpose, date, due_date, status, notes, completed_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(account_id, opportunity_id ?? null, milestone_id ?? null, type.trim(), purpose.trim(), date.trim(), due_date ?? null, resolvedStatus, notes ?? null, resolvedCompletedDate);
  res.status(201).json(db.prepare('SELECT * FROM activities WHERE id = ?').get(result.lastInsertRowid));
});

// PUT update activity
router.put('/:id', (req: Request, res: Response) => {
  const { account_id, opportunity_id, milestone_id, type, purpose, date, due_date, status, notes, completed_date } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });
  if (!type?.trim()) return res.status(400).json({ error: 'type is required' });
  if (!purpose?.trim()) return res.status(400).json({ error: 'purpose is required' });
  if (!date?.trim()) return res.status(400).json({ error: 'date is required' });
  // Auto-set completed_date when marking as Completed (unless explicitly provided or cleared)
  const existing = db.prepare('SELECT completed_date FROM activities WHERE id = ?').get(req.params.id) as any;
  const resolvedCompletedDate = completed_date !== undefined
    ? (completed_date || null)
    : (status === 'Completed' && !existing?.completed_date ? new Date().toISOString().split('T')[0] : (existing?.completed_date ?? null));
  const info = db.prepare(`
    UPDATE activities SET account_id=?, opportunity_id=?, milestone_id=?, type=?, purpose=?, date=?, due_date=?,
    status=?, notes=?, completed_date=?, updated_at=datetime('now') WHERE id=?
  `).run(account_id, opportunity_id ?? null, milestone_id ?? null, type.trim(), purpose.trim(), date.trim(), due_date ?? null, status ?? 'To Do', notes ?? null, resolvedCompletedDate, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Activity not found' });

  // If activity is marked Completed and linked to an opportunity,
  // auto-mark any next step whose title matches this activity's purpose
  if (status === 'Completed' && opportunity_id) {
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      UPDATE opportunity_next_steps
      SET done = 1, completion_date = ?
      WHERE opportunity_id = ?
        AND done = 0
        AND LOWER(TRIM(title)) = LOWER(TRIM(?))
    `).run(today, opportunity_id, purpose.trim());
  }

  res.json(db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id));
});

// PATCH msx_id (saved after successful push-to-MSX from frontend)
router.patch('/:id/msx-id', (req: Request, res: Response) => {
  const { msx_id } = req.body;
  if (msx_id === undefined) return res.status(400).json({ error: 'msx_id is required' });
  const info = db.prepare("UPDATE activities SET msx_id = ? WHERE id = ?").run(msx_id ?? null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Activity not found' });
  res.json({ ok: true });
});

// PATCH status (used by kanban board drag-drop)
router.patch('/:id/kanban', (req: Request, res: Response) => {
  const { status, position } = req.body;
  const completedDate = status === 'Completed' ? new Date().toISOString().split('T')[0] : null;
  const info = db.prepare(
    "UPDATE activities SET status=?, position=?, completed_date=COALESCE(completed_date, ?), updated_at=datetime('now') WHERE id=?"
  ).run(status ?? 'To Do', position ?? 0, completedDate, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Activity not found' });
  res.json(db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id));
});

// DELETE activity
router.delete('/:id', (req: Request, res: Response) => {
  const info = db.prepare('DELETE FROM activities WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Activity not found' });
  res.status(204).end();
});

// GET comments for an activity
router.get('/:id/comments', (req: Request, res: Response) => {
  res.json(db.prepare('SELECT * FROM activity_comments WHERE activity_id = ? ORDER BY created_at ASC').all(req.params.id));
});

// POST add comment to activity
router.post('/:id/comments', (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content is required' });
  const result = db.prepare('INSERT INTO activity_comments (activity_id, content) VALUES (?, ?)').run(req.params.id, content.trim());
  res.status(201).json(db.prepare('SELECT * FROM activity_comments WHERE id = ?').get(result.lastInsertRowid));
});

// DELETE comment
router.delete('/:id/comments/:commentId', (req: Request, res: Response) => {
  const info = db.prepare('DELETE FROM activity_comments WHERE id = ? AND activity_id = ?').run(req.params.commentId, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Comment not found' });
  res.status(204).end();
});

export default router;
