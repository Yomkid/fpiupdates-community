import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
export const SYSTEM_NAMES = ['admin', 'administrator', 'support', 'security', 'moderator'];
export const reservedUsername = (name: string) => SYSTEM_NAMES.includes(name.toLowerCase());
export const usernameFormat = (name: string) => /^[a-z0-9_]{3,30}$/.test(name);
export async function lockUsernames(tx: Prisma.TransactionClient) {
  // One short transaction lock shared by signup, Google enrollment, profile edits and staff actions.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(71502829)::text`;
}
export async function usernameUnavailable(
  tx: Pick<Prisma.TransactionClient, 'usernameHold' | 'user'>,
  name: string,
  userId?: string,
) {
  if (!usernameFormat(name)) return true;
  const existing = await tx.user.findUnique({ where: { username: name }, select: { id: true } });
  if (existing) return existing.id !== userId;
  if (reservedUsername(name)) return true;
  const hold = await tx.usernameHold.findUnique({ where: { username: name } });
  return (
    !!hold &&
    (!userId || hold.ownerId !== userId) &&
    (!hold.expiresAt || hold.expiresAt > new Date())
  );
}
export async function assertUsername(tx: Prisma.TransactionClient, name: string, userId?: string) {
  if (await usernameUnavailable(tx, name, userId))
    throw new ConflictException('This username is unavailable. Try another.');
}
export async function protectOldUsername(
  tx: Prisma.TransactionClient,
  userId: string,
  old: string,
) {
  const prior = await tx.usernameHold.findUnique({ where: { username: old } });
  await tx.usernameHold.upsert({
    where: { username: old },
    create: {
      username: old,
      ownerId: userId,
      reason: 'Former username',
      redirect: true,
      expiresAt: reservedUsername(old) ? null : new Date(Date.now() + 30 * 86400000),
    },
    update: {
      ownerId: userId,
      redirect: true,
      expiresAt: prior && !prior.expiresAt ? null : new Date(Date.now() + 30 * 86400000),
    },
  });
}
export async function assignUsername(tx: Prisma.TransactionClient, userId: string, name: string) {
  if (!usernameFormat(name) || SYSTEM_NAMES.includes(name))
    throw new BadRequestException('Choose a valid non-system username');
  await lockUsernames(tx);
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const occupied = await tx.user.findUnique({ where: { username: name } });
  if (occupied && occupied.id !== userId)
    throw new ConflictException(
      'An account already owns this username. Review the dispute separately.',
    );
  const hold = await tx.usernameHold.findUnique({ where: { username: name } });
  if (hold?.ownerId && hold.ownerId !== userId && (!hold.expiresAt || hold.expiresAt > new Date()))
    throw new ConflictException(
      'This name protects another account. Resolve that protection before assignment.',
    );
  if (user.username !== name) await protectOldUsername(tx, user.id, user.username);
  await tx.usernameHold.upsert({
    where: { username: name },
    create: { username: name, ownerId: userId, reason: 'Approved account assignment' },
    update: { ownerId: userId, redirect: false, expiresAt: null },
  });
  return tx.user.update({
    where: { id: userId },
    data: {
      username: name,
      identityStatus: user.identityStatus === 'VERIFIED' ? 'REVIEW' : user.identityStatus,
    },
  });
}
