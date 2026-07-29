import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireManager } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Lightweight roster for everyone (not manager-gated) — used to color-code
// the team calendar by assignee. No sensitive fields.
router.get('/directory', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, full_name FROM users WHERE active ORDER BY id`
  );
  res.json({ users: rows });
});

router.use(requireManager);

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
  if (!existing) return res.status(404).json({ error: "Utilisateur introuvable" });

  const { role, active, email_verified } = req.body || {};
  if (role && !['engineer', 'manager'].includes(role)) {
    return res.status(400).json({ error: "Le rôle doit être engineer ou manager" });
  }
  if (existing.id === req.user.id && (role === 'engineer' || active === false)) {
    return res.status(400).json({ error: "Vous ne pouvez pas rétrograder ou désactiver votre propre compte" });
  }

  const next = {
    role: role ?? existing.role,
    active: typeof active === 'boolean' ? active : existing.active,
    email_verified: typeof email_verified === 'boolean' ? email_verified : existing.email_verified,
  };

  const { rows } = await pool.query(
    `UPDATE users SET role = $1, active = $2, email_verified = $3 WHERE id = $4
     RETURNING id, full_name, company_email, role, active, email_verified, created_at`,
    [next.role, next.active, next.email_verified, existing.id]
  );
  res.json({ user: rows[0] });
});

export default router;
