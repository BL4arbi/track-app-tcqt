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
  const link = `${process.env.APP_BASE_URL}/verify-email?token=${token}`;
  return {
    subject: 'Verify your SolidWorks Tracker account',
    html: `<p>Welcome to SolidWorks Tracker. Click the link below to verify your account:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 24 hours.</p>`,
  };
}

export function resetPasswordEmail(token) {
  const link = `${process.env.APP_BASE_URL}/reset-password?token=${token}`;
  return {
    subject: 'Reset your SolidWorks Tracker password',
    html: `<p>Click the link below to reset your password:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
  };
}
