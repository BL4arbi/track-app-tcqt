import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { signSessionToken, signPurposeToken, verifyToken } from '../services/tokens.js';
import { sendMail, verificationEmail, resetPasswordEmail } from '../services/email.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function isAllowedDomain(email) {
  const domain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (!domain) return true;
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}

router.post('/signup', async (req, res) => {
  const { full_name, company_email, password } = req.body || {};
  if (!full_name || !company_email || !password) {
    return res.status(400).json({ error: "Le nom complet, l'email et le mot de passe sont obligatoires" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères" });
  }
  const email = String(company_email).toLowerCase().trim();
  if (!isAllowedDomain(email)) {
    return res.status(400).json({ error: `L'inscription est réservée aux adresses @${process.env.ALLOWED_EMAIL_DOMAIN}` });
  }

  const existing = await pool.query('SELECT id FROM users WHERE company_email = $1', [email]);
  if (existing.rows.length) {
    return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
  }

  const password_hash = await bcrypt.hash(password, 10);
  // The very first account on a fresh install becomes the manager/admin —
  // there's no other way to bootstrap admin access without DB access.
  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  const role = countRows[0].count === 0 ? 'manager' : 'engineer';

  const { rows } = await pool.query(
    `INSERT INTO users (full_name, company_email, password_hash, role)
     VALUES ($1, $2, $3, $4) RETURNING id, full_name, company_email, role, email_verified`,
    [full_name, email, password_hash, role]
  );
  const user = rows[0];

  const token = signPurposeToken(user.id, 'verify_email', '24h');
  const { subject, html } = verificationEmail(token);
  await sendMail({ to: user.company_email, subject, html });

  res.status(201).json({ message: "Compte créé. Vérifiez votre email pour activer votre compte.", user });
});

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Jeton manquant" });
  try {
    const payload = verifyToken(token);
    if (payload.purpose !== 'verify_email') throw new Error('wrong purpose');
    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [payload.sub]);
    res.json({ message: "Email vérifié. Vous pouvez maintenant vous connecter." });
  } catch {
    res.status(400).json({ error: "Lien de vérification invalide ou expiré" });
  }
});

router.post('/login', async (req, res) => {
  const { company_email, password } = req.body || {};
  if (!company_email || !password) {
    return res.status(400).json({ error: "L'email et le mot de passe sont obligatoires" });
  }
  const email = String(company_email).toLowerCase().trim();
  const { rows } = await pool.query('SELECT * FROM users WHERE company_email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Email ou mot de passe incorrect" });
  }
  if (!user.active) return res.status(403).json({ error: "Ce compte est désactivé" });
  if (!user.email_verified) {
    return res.status(403).json({ error: "Veuillez vérifier votre email avant de vous connecter" });
  }

  const token = signSessionToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      full_name: user.full_name,
      company_email: user.company_email,
      role: user.role,
    },
  });
});

router.post('/forgot-password', async (req, res) => {
  const { company_email } = req.body || {};
  const email = String(company_email || '').toLowerCase().trim();
  const { rows } = await pool.query('SELECT id FROM users WHERE company_email = $1', [email]);
  // Always respond 200 so we don't leak which emails have accounts.
  if (rows[0]) {
    const token = signPurposeToken(rows[0].id, 'reset_password', '1h');
    const { subject, html } = resetPasswordEmail(token);
    await sendMail({ to: email, subject, html });
  }
  res.json({ message: "Si cet email correspond à un compte, un lien de réinitialisation a été envoyé." });
});

router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password) return res.status(400).json({ error: "Le jeton et le nouveau mot de passe sont obligatoires" });
  if (new_password.length < 8) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères" });
  try {
    const payload = verifyToken(token);
    if (payload.purpose !== 'reset_password') throw new Error('wrong purpose');
    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, payload.sub]);
    res.json({ message: "Mot de passe mis à jour. Vous pouvez maintenant vous connecter." });
  } catch {
    res.status(400).json({ error: "Lien de réinitialisation invalide ou expiré" });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
