import { verifyToken } from '../services/tokens.js';
import { pool } from '../db/pool.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Jeton manquant" });

  try {
    const payload = verifyToken(token);
    const { rows } = await pool.query(
      'SELECT id, full_name, company_email, role, active, email_verified FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: "Session invalide" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Jeton invalide ou expiré" });
  }
}

export function requireManager(req, res, next) {
  if (req.user?.role !== 'manager') {
    return res.status(403).json({ error: "Rôle manager requis" });
  }
  next();
}
