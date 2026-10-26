import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deliverEmail } from './email-delivery';
import { Database } from './database';
import { hashPassword, newToken, tokenHash } from './security';
@Injectable()
export class RecoveryService {
  constructor(private readonly db: Database) {}
  async send(userId: string, purpose: 'VERIFY' | 'RESET') {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const recent = await this.db.actionToken.findFirst({
      where: { userId, purpose, createdAt: { gt: new Date(Date.now() - 60000) } },
    });
    if (recent) return;
    const transport =
      process.env.EMAIL_TRANSPORT ?? (process.env.NODE_ENV === 'production' ? 'smtp' : 'file');
    if (transport === 'file' && process.env.NODE_ENV === 'production')
      throw new ServiceUnavailableException('Email service not configured');
    const token = newToken();
    const expiresAt = new Date(Date.now() + (purpose === 'RESET' ? 30 : 1440) * 60000);
    const record = await this.db.actionToken.create({
      data: { userId, purpose, tokenHash: tokenHash(token), expiresAt },
    });
    const base = process.env.APP_URL ?? 'http://localhost:5173';
    const link = `${base}/${purpose === 'RESET' ? 'reset-password' : 'verify-email'}#token=${token}`;
    const subject =
      purpose === 'RESET' ? 'Reset your FpiUpdates password' : 'Verify your FpiUpdates email';
    const text = `${subject}\n\n${link}\n\nThis link expires ${expiresAt.toISOString()} and works once. If you did not request it, ignore this message.`;
    try {
      if (transport === 'file') {
        const directory = resolve(process.cwd(), '.local-mail');
        await mkdir(directory, { recursive: true });
        await writeFile(
          resolve(directory, `${record.id}.txt`),
          `To: ${user.email}\nSubject: ${subject}\n\n${text}`,
          { mode: 0o600, flag: 'wx' },
        );
        console.log(`Development email saved in backend/.local-mail/${record.id}.txt`);
      } else {
        await deliverEmail({ to: user.email, subject, text });
      }
    } catch {
      await this.db.actionToken.deleteMany({ where: { id: record.id } });
      throw new ServiceUnavailableException('Email service unavailable; please try again later');
    }
  }
  async forgot(email: string) {
    const user = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user?.status === 'ACTIVE') {
      try {
        await this.send(user.id, 'RESET');
      } catch {
        console.warn('Password recovery delivery unavailable');
      }
    }
    return { message: 'If an active account matches, recovery instructions have been sent.' };
  }
  async consume(token: string, purpose: 'VERIFY' | 'RESET', password?: string) {
    const record = await this.db.actionToken.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt <= new Date())
      throw new BadRequestException('This link is invalid or expired');
    const passwordHash = password ? await hashPassword(password) : undefined;
    await this.db.$transaction(async (tx) => {
      const consumed = await tx.actionToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw new BadRequestException('This link is invalid or expired');
      if (purpose === 'VERIFY')
        await tx.user.update({
          where: { id: record.userId },
          data: { emailVerifiedAt: new Date() },
        });
      else {
        await tx.user.update({
          where: { id: record.userId },
          data: { passwordHash, passwordEnabled: true },
        });
        await tx.session.deleteMany({ where: { userId: record.userId } });
        await tx.actionToken.updateMany({
          where: { userId: record.userId, purpose: 'RESET', usedAt: null },
          data: { usedAt: new Date() },
        });
      }
    });
    return {
      message:
        purpose === 'VERIFY'
          ? 'Email verified.'
          : 'Password changed. Sign in with your new password.',
    };
  }
}
