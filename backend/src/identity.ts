import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Database } from './database';
import { SessionGuard, AuthRequest, publicUser } from './auth';
import { PermissionGuard, RequirePermission, VerifiedGuard } from './permissions';
import { assignUsername, lockUsernames, SYSTEM_NAMES } from './usernames';
import { sendAccountEmail } from './mail-template';
const categories = ['INDIVIDUAL', 'BUSINESS', 'INSTITUTION', 'GOVERNMENT', 'MEDIA', 'CREATOR'];
class ApplicationDto {
  @IsIn(['VERIFICATION', 'USERNAME', 'IMPERSONATION', 'APPEAL']) kind!: string;
  @IsIn(categories) category!: string;
  @IsOptional() @Matches(/^[a-z0-9_]{3,30}$/) username?: string;
  @IsString() @MinLength(20) @MaxLength(4000) evidence!: string;
}
class DecisionDto {
  @IsIn(['APPROVED', 'REJECTED', 'NEEDS_INFO']) status!: string;
  @IsString() @MinLength(5) @MaxLength(1000) decision!: string;
}
class HoldDto {
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsBoolean() release!: boolean;
}
class AssignmentDto {
  @IsUUID() userId!: string;
  @Matches(/^[a-z0-9_]{3,30}$/) username!: string;
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
class BadgeDto {
  @IsIn(['VERIFIED', 'SUSPENDED', 'REVOKED', 'REVIEW']) status!: string;
  @IsIn(categories) category!: string;
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
@Controller('identity')
@UseGuards(SessionGuard)
export class IdentityController {
  constructor(private readonly db: Database) {}
  @Get('requests') mine(@Req() req: AuthRequest) {
    return this.db.identityRequest.findMany({
      where: { userId: req.account.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
  @Post('requests')
  @UseGuards(VerifiedGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  async apply(@Req() req: AuthRequest, @Body() dto: ApplicationDto) {
    if (dto.kind === 'USERNAME' && !dto.username)
      throw new BadRequestException('Enter the requested username');
    return this.db.$transaction(async (tx) => {
      await lockUsernames(tx);
      if (
        await tx.identityRequest.count({
          where: {
            userId: req.account.id,
            kind: dto.kind,
            status: { in: ['PENDING', 'NEEDS_INFO'] },
          },
        })
      )
        throw new BadRequestException(
          'You already have an open request of this type. Add information to that request.',
        );
      return tx.identityRequest.create({ data: { ...dto, userId: req.account.id } });
    });
  }
  @Put('requests/:id')
  @UseGuards(VerifiedGuard)
  async supplement(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Body() dto: ApplicationDto,
  ) {
    const row = await this.db.identityRequest.findFirst({
      where: { id, userId: req.account.id, status: 'NEEDS_INFO' },
    });
    if (!row) throw new NotFoundException();
    return this.db.identityRequest.update({
      where: { id },
      data: { evidence: dto.evidence, status: 'PENDING' },
    });
  }
  @Get('notices') notices(@Req() req: AuthRequest) {
    return this.db.accountNotice.findMany({
      where: { userId: req.account.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }
  @Put('notices/:id/read') async read(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    await this.db.accountNotice.updateMany({
      where: { id, userId: req.account.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
  @Put('completion-dismiss') async dismiss(@Req() req: AuthRequest) {
    await this.db.user.update({
      where: { id: req.account.id },
      data: { profileCompletionDismissed: true },
    });
    return { ok: true };
  }
}
@Controller('admin/identity')
@UseGuards(SessionGuard, PermissionGuard)
export class IdentityAdminController {
  constructor(private readonly db: Database) {}
  @Get('users') @RequirePermission('verification.manage') users(@Query('q') q = '') {
    if (q.length > 80) throw new BadRequestException();
    return this.db.user.findMany({
      where: q
        ? {
            OR: [
              { username: { contains: q.toLowerCase() } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
      select: { ...publicUser, status: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
  }
  @Get('assignment-users') @RequirePermission('usernames.manage') assignmentUsers(
    @Query('q') q = '',
  ) {
    const query = q.trim();
    if (query.length > 80) throw new BadRequestException();
    if (query.length < 2) return [];
    return this.db.user.findMany({
      where: {
        OR: [
          { username: { contains: query.toLowerCase() } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: publicUser,
      take: 20,
      orderBy: { username: 'asc' },
    });
  }
  @Get('holds') @RequirePermission('usernames.manage') async holds() {
    const rows = await this.db.usernameHold.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    const ownerIds = rows.flatMap((row) => (row.ownerId ? [row.ownerId] : []));
    const owners = ownerIds.length
      ? await this.db.user.findMany({ where: { id: { in: ownerIds } }, select: publicUser })
      : [];
    return rows.map((row) => ({
      ...row,
      owner: owners.find((owner) => owner.id === row.ownerId) ?? null,
    }));
  }
  @Put('holds/:name') @RequirePermission('usernames.manage') async hold(
    @Param('name') name: string,
    @Body() dto: HoldDto,
    @Req() req: AuthRequest,
  ) {
    if (!/^[a-z0-9_]{3,30}$/.test(name) || SYSTEM_NAMES.includes(name))
      throw new BadRequestException('Invalid or protected system name');
    return this.db.$transaction(async (tx) => {
      await lockUsernames(tx);
      const occupied = await tx.user.findUnique({ where: { username: name } });
      if (occupied)
        throw new BadRequestException(
          'This username is already owned. Reservations cannot displace an account.',
        );
      const existing = await tx.usernameHold.findUnique({ where: { username: name } });
      if (existing?.ownerId)
        throw new BadRequestException('An account-linked protection cannot be released here.');
      if (dto.release) {
        await tx.usernameHold.deleteMany({ where: { username: name } });
      } else
        await tx.usernameHold.upsert({
          where: { username: name },
          create: { username: name, reason: dto.reason },
          update: { reason: dto.reason, expiresAt: null },
        });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: dto.release ? 'username.release' : 'username.reserve',
          targetId: name,
          reason: dto.reason,
        },
      });
      return { ok: true };
    });
  }
  @Put('assign') @RequirePermission('usernames.manage') async assign(
    @Body() dto: AssignmentDto,
    @Req() req: AuthRequest,
  ) {
    await this.db.$transaction(async (tx) => {
      await assignUsername(tx, dto.userId, dto.username);
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'username.assign',
          targetId: dto.userId,
          reason: `${dto.username}: ${dto.reason}`.slice(0, 500),
        },
      });
      await tx.accountNotice.create({
        data: {
          userId: dto.userId,
          message: `Your username is now @${dto.username}. Your account and content are unchanged. Contact support if this was unexpected.`,
        },
      });
    });
    return { ok: true };
  }
  @Get('requests') @RequirePermission('verification.manage') async requests() {
    const rows = await this.db.identityRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const users = await this.db.user.findMany({
      where: { id: { in: rows.map((x) => x.userId) } },
      select: publicUser,
    });
    return rows.map((row) => ({ ...row, user: users.find((u) => u.id === row.userId) }));
  }
  @Put('requests/:id') @RequirePermission('verification.manage') async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
    @Req() req: AuthRequest,
  ) {
    await this.db.$transaction(async (tx) => {
      const changed = await tx.identityRequest.updateMany({
        where: { id, status: { in: ['PENDING', 'NEEDS_INFO'] } },
        data: { ...dto, reviewedById: req.account.id, reviewedAt: new Date() },
      });
      if (changed.count !== 1)
        throw new BadRequestException('Request is already decided or missing');
      const row = await tx.identityRequest.findUniqueOrThrow({ where: { id } });
      // Username claims require a separate usernames.manage assignment; a review never seizes a handle.
      if (row.kind === 'VERIFICATION' && dto.status === 'APPROVED') {
        const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId } });
        if (!user.emailVerifiedAt || user.status !== 'ACTIVE')
          throw new BadRequestException('An active account with confirmed email is required');
        await tx.user.update({
          where: { id: row.userId },
          data: {
            identityStatus: 'VERIFIED',
            identityCategory: row.category,
            identityVerifiedAt: new Date(),
          },
        });
      }
      await tx.accountNotice.create({
        data: {
          userId: row.userId,
          message:
            `${row.kind.toLowerCase()} request ${dto.status.toLowerCase().replace('_', ' ')}: ${dto.decision}`.slice(
              0,
              1000,
            ),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'identity.request.review',
          targetId: id,
          reason: `${dto.status}: ${dto.decision}`.slice(0, 500),
        },
      });
    });
    const row = await this.db.identityRequest.findUniqueOrThrow({ where: { id } });
    await sendAccountEmail(
      this.db,
      row.userId,
      'Your FpiUpdates request has an update',
      dto.decision,
      '/settings/verification',
    );
    return { ok: true };
  }
  @Put('users/:id') @RequirePermission('verification.manage') async badge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BadgeDto,
    @Req() req: AuthRequest,
  ) {
    await this.db.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      if (dto.status === 'VERIFIED' && (!user.emailVerifiedAt || user.status !== 'ACTIVE'))
        throw new BadRequestException('An active account with confirmed email is required');
      await tx.user.update({
        where: { id },
        data: {
          identityStatus: dto.status,
          identityCategory: dto.category,
          identityVerifiedAt: dto.status === 'VERIFIED' ? new Date() : user.identityVerifiedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'identity.' + dto.status.toLowerCase(),
          targetId: id,
          reason: dto.reason,
        },
      });
      await tx.accountNotice.create({
        data: {
          userId: id,
          message: `Identity verification: ${dto.status.toLowerCase()}. ${dto.reason}`,
        },
      });
    });
    await sendAccountEmail(
      this.db,
      id,
      'Your FpiUpdates verification status',
      `Status: ${dto.status.toLowerCase()}. ${dto.reason}`,
      '/settings/verification',
    );
    return { ok: true };
  }
}
