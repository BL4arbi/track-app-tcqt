import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireManager } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireManager);

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, full_name, company_email, role, active, email_verified, created_at
     FROM users ORDER BY full_name`
  );
  res.json({ users: rows });
});

router.patch('/:id', async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { role, active } = req.body || {};
  if (role && !['engineer', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'role must be engineer or manager' });
  }
  if (existing.id === req.user.id && (role === 'engineer' || active === false)) {
    return res.status(400).json({ error: "You can't demote or deactivate your own account" });
  }

  const next = {
    role: role ?? existing.role,
    active: typeof active === 'boolean' ? active : existing.active,
  };

  const { rows } = await pool.query(
    `UPDATE users SET role = $1, active = $2 WHERE id = $3
     RETURNING id, full_name, company_email, role, active, email_verified, created_at`,
    [next.role, next.active, existing.id]
  );
  res.json({ user: rows[0] });
});

export default router;
