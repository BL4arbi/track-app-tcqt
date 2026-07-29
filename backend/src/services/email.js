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
  const link = `${process.env.APP_BASE_URL}/#/verify-email?token=${token}`;
  return {
    subject: 'Vérifiez votre compte SolidWorks Tracker',
    html: `<p>Bienvenue sur SolidWorks Tracker. Cliquez sur le lien ci-dessous pour vérifier votre compte :</p>
           <p><a href="${link}">${link}</a></p>
           <p>Ce lien expire dans 24 heures.</p>`,
  };
}

export function resetPasswordEmail(token) {
  const link = `${process.env.APP_BASE_URL}/#/reset-password?token=${token}`;
  return {
    subject: 'Réinitialisation de votre mot de passe SolidWorks Tracker',
    html: `<p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
           <p><a href="${link}">${link}</a></p>
           <p>Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
  };
}
