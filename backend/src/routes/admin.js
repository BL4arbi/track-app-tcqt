import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireManager } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireManager);

// Simple counts for the admin panel — the handout defers real stats/charts
// (time-per-step, bottlenecks) to phase 2 once task_history has real data.
router.get('/overview', async (_req, res) => {
  const [totals, byStatus, byClient, byUser] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE active) AS active_users,
        (SELECT COUNT(*)::int FROM clients) AS total_clients,
        (SELECT COUNT(*)::int FROM tasks) AS total_tasks
    `),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM tasks GROUP BY status`),
    pool.query(`
      SELECT c.name AS client_name, COUNT(t.id)::int AS active_tasks
      FROM clients c LEFT JOIN tasks t ON t.client_id = c.id AND t.status = 'active'
      GROUP BY c.id, c.name ORDER BY active_tasks DESC, c.name
    `),
    pool.query(`
      SELECT u.full_name, COUNT(t.id)::int AS active_tasks
      FROM users u LEFT JOIN tasks t ON t.assigned_user_id = u.id AND t.status = 'active'
      WHERE u.active
      GROUP BY u.id, u.full_name ORDER BY active_tasks DESC, u.full_name
    `),
  ]);

  res.json({
    totals: totals.rows[0],
    tasks_by_status: byStatus.rows,
    tasks_by_client: byClient.rows,
    tasks_by_user: byUser.rows,
  });
});

export default router;
