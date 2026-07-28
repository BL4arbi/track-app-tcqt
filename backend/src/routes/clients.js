import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, name, notes FROM clients ORDER BY name');
  res.json({ clients: rows });
});

router.post('/', async (req, res) => {
  const { name, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await pool.query(
    'INSERT INTO clients (name, notes) VALUES ($1, $2) RETURNING id, name, notes',
    [name, notes || null]
  );
  res.status(201).json({ client: rows[0] });
});

export default router;
