import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Cross-task view of every "Achat" entry, for spotting when two different
// people are about to separately order the same thing — everyone can see
// it (not manager-only), since the whole point is team-wide coordination.
// other_tasks_count: how many OTHER tasks have a purchase with the same
// ref (or description, if no ref) that isn't marked "reçu" yet — the
// frontend highlights any row where this is > 0.
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(`
    WITH keyed AS (
      SELECT p.*, lower(COALESCE(NULLIF(p.ref, ''), p.description)) AS dedup_key
      FROM task_purchases p
    )
    SELECT k.id, k.task_id, t.title AS task_title, t.label AS task_label,
           u.full_name AS assigned_user_name,
           k.machine, k.category, k.description, k.quantity, k.ref, k.status,
           k.supplier_id, COALESCE(s.name, k.supplier_name) AS supplier_name, s.link AS supplier_link,
           k.created_at, creator.full_name AS created_by,
           COALESCE(dup.other_tasks_count, 0) AS other_tasks_count
    FROM keyed k
    JOIN tasks t ON t.id = k.task_id
    JOIN users u ON u.id = t.assigned_user_id
    JOIN users creator ON creator.id = k.created_by
    LEFT JOIN suppliers s ON s.id = k.supplier_id
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT k2.task_id)::int AS other_tasks_count
      FROM keyed k2
      WHERE k2.dedup_key = k.dedup_key AND k2.task_id != k.task_id AND k2.status != 'recu'
    ) dup ON true
    ORDER BY k.dedup_key, k.created_at
  `);
  res.json({ purchases: rows });
});

export default router;
