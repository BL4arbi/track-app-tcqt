import nodemailer from 'nodemailer';

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, html }) {
  if (!process.env.SMTP_HOST) {
    // No SMTP configured (e.g. local dev) — log instead of throwing so the
    // rest of the flow (signup, reset) still works end to end locally.
    console.log(`[email:not-configured] to=${to} subject="${subject}"\n${html}`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}

export function verificationEmail(token) {
  // Points at the backend directly, not the frontend: verifying is a pure
  // one-click confirmation with no further input needed, so the backend can
  // just do it and return a confirmation page itself — no dependency on the
  // frontend (a separate process with no permanent web address) being up
  // at all. Password reset (below) needs a form, but the backend now
  // serves that itself too, for the same reason.
  const link = `${process.env.API_BASE_URL}/api/auth/verify-email?token=${token}`;
  return {
    subject: 'Vérifiez votre compte SolidWorks Tracker',
    html: `<p>Bienvenue sur SolidWorks Tracker. Cliquez sur le lien ci-dessous pour vérifier votre compte :</p>
           <p><a href="${link}">${link}</a></p>
           <p>Ce lien expire dans 24 heures.</p>`,
  };
}

export function resetPasswordEmail(token) {
  // Points at the backend directly, same as verify-email — the frontend has
  // no permanent address an email link can reach (the dev server port isn't
  // a real production endpoint, and the packaged desktop app isn't a web
  // server at all), so the backend now serves its own reset form.
  const link = `${process.env.API_BASE_URL}/api/auth/reset-password?token=${token}`;
  return {
    subject: 'Réinitialisation de votre mot de passe SolidWorks Tracker',
    html: `<p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
           <p><a href="${link}">${link}</a></p>
           <p>Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
  };
}
