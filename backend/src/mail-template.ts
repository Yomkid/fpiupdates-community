import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Database } from './database';
import { deliverEmail } from './email-delivery';
export const escapeEmail = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function emailTemplate(
  title: string,
  message: string,
  link: string,
  button = 'Open FpiUpdates',
) {
  const base = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;color:#17221b;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px" cellpadding="28"><tr><td><img src="${escapeEmail(base)}/brand-logo-color.png" width="64" height="64" alt="FpiUpdates"><h1 style="font-size:24px;line-height:1.3">${escapeEmail(title)}</h1><p style="font-size:16px;line-height:1.6;white-space:pre-line">${escapeEmail(message)}</p><p style="padding:16px 0"><a href="${escapeEmail(link)}" style="background:#15803d;color:white;text-decoration:none;padding:14px 22px;border-radius:24px;display:inline-block">${escapeEmail(button)}</a></p><p style="font-size:13px;line-height:1.5">If the button does not work, copy this address:<br><a href="${escapeEmail(link)}" style="color:#15803d;word-break:break-all">${escapeEmail(link)}</a></p><hr style="border:0;border-top:1px solid #e5e7eb"><p style="font-size:12px;color:#58645c;line-height:1.6">FpiUpdates · Your people. Your updates.<br>Need help? <a href="${escapeEmail(base)}/help">Visit our Help Centre</a>.<br>This is an account service email. Never share your password or verification link.</p></td></tr></table></td></tr></table></body></html>`;
}
export async function sendAccountEmail(
  db: Database,
  userId: string,
  subject: string,
  message: string,
  path: string,
) {
  try {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const link = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '') + path;
    const mail = {
      to: user.email,
      subject,
      text: `${message}\n\n${link}`,
      html: emailTemplate(subject, message, link),
    };
    if (
      (process.env.EMAIL_TRANSPORT ?? (process.env.NODE_ENV === 'production' ? 'smtp' : 'file')) ===
      'file'
    ) {
      if (process.env.NODE_ENV === 'production') return;
      const directory = resolve(process.cwd(), '.local-mail');
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, randomUUID() + '.html'), mail.html, { mode: 0o600 });
    } else await deliverEmail(mail);
  } catch {
    console.warn('Account email delivery unavailable; in-app account notices remain available.');
  }
}
