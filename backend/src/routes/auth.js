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

// Hit directly from the email link (not the frontend) — a plain GET/POST the
// backend can fully handle itself, so these never depend on the
// frontend/desktop app (a separate process, not always running, and with no
// permanent web address to link to from an email — the dev server port
// isn't a real production endpoint) being installed or running anywhere.
function resultPage({ ok, message }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>SolidWorks Tracker</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; background: #f7f7f9; color: #08060d; }
  .card { max-width: 420px; padding: 32px; border: 1px solid #e2e1e6; border-radius: 8px; background: #fff; text-align: center; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  p { margin: 0 0 16px; color: ${ok ? '#1a7f4b' : '#c0362c'}; }
</style></head>
<body><div class="card">
  <h1>SolidWorks Team Tracker</h1>
  <p>${message}</p>
  ${ok ? '<p style="color:#08060d">Vous pouvez fermer cette page et retourner à l’application.</p>' : ''}
</div></body></html>`;
}

function resetPasswordFormPage({ token, error }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>SolidWorks Tracker</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; background: #f7f7f9; color: #08060d; }
  .card { max-width: 380px; width: 100%; padding: 32px; border: 1px solid #e2e1e6; border-radius: 8px; background: #fff; }
  h1 { font-size: 18px; margin: 0 0 16px; text-align: center; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
  input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #e2e1e6; border-radius: 6px; font: inherit; }
  button { width: 100%; margin-top: 20px; padding: 10px; border: none; border-radius: 6px; background: #c8102e; color: #fff; font-weight: 600; font-size: 14px; cursor: pointer; }
  .error { color: #c0362c; font-size: 13px; margin: 8px 0 0; }
</style></head>
<body><div class="card">
  <h1>Réinitialiser le mot de passe</h1>
  <form method="POST" action="/api/auth/reset-password">
    <input type="hidden" name="token" value="${token}" />
    <label>Nouveau mot de passe</label>
    <input type="password" name="new_password" minlength="8" required />
    <label>Confirmer le mot de passe</label>
    <input type="password" name="confirm_password" minlength="8" required />
    ${error ? `<p class="error">${error}</p>` : ''}
    <button type="submit">Réinitialiser</button>
  </form>
</div></body></html>`;
}

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send(resultPage({ ok: false, message: 'Jeton manquant.' }));
  }
  try {
    const payload = verifyToken(token);
    if (payload.purpose !== 'verify_email') throw new Error('wrong purpose');
    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [payload.sub]);
    res.send(resultPage({ ok: true, message: 'Email vérifié. Vous pouvez maintenant vous connecter.' }));
  } catch {
    res.status(400).send(resultPage({ ok: false, message: 'Lien de vérification invalide ou expiré.' }));
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

// Hit directly from the email link, same reasoning as verify-email above —
// serves its own form, no frontend dependency. Unlike verify-email this
// needs actual input (the new password), so GET renders the form and POST
// (submitted by that same form, application/x-www-form-urlencoded) handles
// it — both fully self-contained on the backend.
router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send(resultPage({ ok: false, message: 'Jeton manquant.' }));
  try {
    const payload = verifyToken(token);
    if (payload.purpose !== 'reset_password') throw new Error('wrong purpose');
  } catch {
    return res.status(400).send(resultPage({ ok: false, message: 'Lien de réinitialisation invalide ou expiré.' }));
  }
  res.send(resetPasswordFormPage({ token }));
});

router.post('/reset-password', async (req, res) => {
  const { token, new_password, confirm_password } = req.body || {};
  const isFormSubmit = confirm_password !== undefined;

  const fail = (message) => {
    if (isFormSubmit) return res.status(400).send(resetPasswordFormPage({ token, error: message }));
    return res.status(400).json({ error: message });
  };

  if (!token || !new_password) return fail('Le jeton et le nouveau mot de passe sont obligatoires');
  if (new_password.length < 8) return fail('Le mot de passe doit contenir au moins 8 caractères');
  if (isFormSubmit && new_password !== confirm_password) return fail('Les mots de passe ne correspondent pas');

  try {
    const payload = verifyToken(token);
    if (payload.purpose !== 'reset_password') throw new Error('wrong purpose');
    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, payload.sub]);
    const message = 'Mot de passe mis à jour. Vous pouvez maintenant vous connecter.';
    if (isFormSubmit) return res.send(resultPage({ ok: true, message }));
    res.json({ message });
  } catch {
    fail('Lien de réinitialisation invalide ou expiré');
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
