import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, name, link FROM suppliers ORDER BY name');
  res.json({ suppliers: rows });
});

// Any authenticated user can add a supplier — this is meant to be created
// inline from the purchase form the moment someone needs a new one, not a
// manager-gated admin action. Re-typing an existing name (case-insensitive)
// reuses that row instead of erroring, since the name is UNIQUE.
router.post('/', async (req, res) => {
  const { name, link } = req.body || {};
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return res.status(400).json({ error: 'Le nom du fournisseur est obligatoire' });

  const { rows: existing } = await pool.query(
    'SELECT id, name, link FROM suppliers WHERE lower(name) = lower($1)',
    [trimmedName]
  );
  if (existing[0]) return res.status(200).json({ supplier: existing[0] });

  const { rows } = await pool.query(
    'INSERT INTO suppliers (name, link) VALUES ($1, $2) RETURNING id, name, link',
    [trimmedName, link || null]
  );
  res.status(201).json({ supplier: rows[0] });
});

export default router;
