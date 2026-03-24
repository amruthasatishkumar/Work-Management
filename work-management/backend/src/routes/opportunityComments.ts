import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router({ mergeParams: true });

// GET all comments for an opportunity (oldest first)
router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT * FROM opportunity_comments
    WHERE opportunity_id = ?
    ORDER BY created_at ASC
  `).all(req.params.id);
  res.json(rows);
});

// POST create comment
router.post('/', (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content is required' });
  const result = db.prepare(
    'INSERT INTO opportunity_comments (opportunity_id, content) VALUES (?, ?)'
  ).run(req.params.id, content.trim());
  res.status(201).json(
    db.prepare('SELECT * FROM opportunity_comments WHERE id = ?').get(result.lastInsertRowid)
  );
});

// DELETE comment
router.delete('/:commentId', (req: Request, res: Response) => {
  const info = db.prepare(
    'DELETE FROM opportunity_comments WHERE id = ? AND opportunity_id = ?'
  ).run(req.params.commentId, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Comment not found' });
  res.status(204).end();
});

// PATCH msx_id (saved after successful push-to-MSX annotation from frontend)
router.patch('/:commentId/msx-id', (req: Request, res: Response) => {
  const { msx_id } = req.body;
  // Allow clearing msx_id by passing null
  const info = db.prepare('UPDATE opportunity_comments SET msx_id = ? WHERE id = ? AND opportunity_id = ?')
    .run(msx_id ?? null, req.params.commentId, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Comment not found' });
  res.json({ ok: true });
});

export default router;
