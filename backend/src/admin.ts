import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Database } from './database';
import { AuthRequest, publicUser, SessionGuard } from './auth';
import { PermissionGuard, RequirePermission } from './permissions';
import {
  ReportFilterDto,
  ReviewDto,
  CommunityDto,
  MenuDto,
  ModerationDto,
  PERMISSIONS,
  RoleDto,
  RolesDto,
  StatusDto,
  TopicDto,
} from './feature-dtos';
import { Prisma } from '@prisma/client';
@Controller('admin')
@UseGuards(SessionGuard, PermissionGuard)
export class AdminController {
  constructor(private readonly db: Database) {}
  @Get('reports') @RequirePermission('moderation.manage') async reports(
    @Query() q: ReportFilterDto,
  ) {
    const cursor = q.before
      ? await this.db.report.findUnique({
          where: { id: q.before },
          select: { id: true, createdAt: true },
        })
      : null;
    if (q.before && !cursor) throw new BadRequestException('Report cursor no longer exists');
    return this.db.report.findMany({
      where: {
        ...(q.status && q.status !== 'ALL' ? { status: q.status } : {}),
        ...(q.reason ? { reason: q.reason } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: {
        post: { include: { author: { select: publicUser } } },
        reporter: { select: publicUser },
      },
    });
  }
  @Put('reports/:id/resolve') @RequirePermission('moderation.manage') resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @Req() req: AuthRequest,
  ) {
    return this.review(id, 'RESOLVED', dto.note ?? 'Report reviewed and resolved', req.account.id);
  }
  @Put('reports/:id/reopen') @RequirePermission('moderation.manage') reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @Req() req: AuthRequest,
  ) {
    return this.review(
      id,
      'OPEN',
      dto.note ?? 'Report reopened for further review',
      req.account.id,
    );
  }
  private async review(id: string, status: string, note: string, actorId: string) {
    if (!(await this.db.report.findUnique({ where: { id } }))) throw new NotFoundException();
    return this.db.$transaction(async (tx) => {
      await tx.report.update({
        where: { id },
        data: { status, reviewedAt: new Date(), reviewedById: actorId, reviewNote: note },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: status === 'OPEN' ? 'report.reopen' : 'report.resolve',
          targetId: id,
          reason: note,
        },
      });
      return { ok: true };
    });
  }
  @Put('posts/:id/moderation') @RequirePermission('moderation.manage') async moderate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationDto,
    @Req() req: AuthRequest,
  ) {
    if (!(await this.db.post.findUnique({ where: { id } }))) throw new NotFoundException();
    return this.db.$transaction(async (tx) => {
      await tx.post.update({ where: { id }, data: { status: dto.status } });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: `post.${dto.status.toLowerCase()}`,
          targetId: id,
          reason: dto.reason,
        },
      });
      return { ok: true };
    });
  }
  @Get('users') @RequirePermission('users.manage') users() {
    return this.db.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        ...publicUser,
        status: true,
        emailVerifiedAt: true,
        roles: { include: { role: true } },
      },
    });
  }
  @Put('users/:id/status') @RequirePermission('users.manage') async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @Req() req: AuthRequest,
  ) {
    if (id === req.account.id) throw new BadRequestException('You cannot suspend your own account');
    return this.db.$transaction(
      async (tx) => {
        if (!(await tx.user.findUnique({ where: { id } }))) throw new NotFoundException();
        if (dto.status === 'SUSPENDED') await this.otherAdministrator(tx, id);
        await tx.user.update({ where: { id }, data: { status: dto.status } });
        if (dto.status === 'SUSPENDED') await tx.session.deleteMany({ where: { userId: id } });
        await tx.auditLog.create({
          data: {
            actorId: req.account.id,
            action: `account.${dto.status.toLowerCase()}`,
            targetId: id,
            reason: dto.reason,
          },
        });
        return { ok: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private async otherAdministrator(tx: Prisma.TransactionClient, id: string) {
    const target = await tx.userRole.findFirst({
      where: { userId: id, role: { permissions: { has: 'roles.manage' } } },
    });
    if (
      target &&
      (await tx.user.count({
        where: {
          id: { not: id },
          status: 'ACTIVE',
          roles: { some: { role: { permissions: { has: 'roles.manage' } } } },
        },
      })) === 0
    )
      throw new BadRequestException('Keep at least one active role administrator');
  }
  @Get('roles') @RequirePermission('roles.manage') async roles() {
    return {
      permissions: PERMISSIONS,
      roles: await this.db.role.findMany({ orderBy: { name: 'asc' } }),
    };
  }
  @Put('roles/:key') @RequirePermission('roles.manage') async role(
    @Param('key') key: string,
    @Body() dto: RoleDto,
    @Req() req: AuthRequest,
  ) {
    if (!/^[a-z0-9-]{2,50}$/.test(key) || key === 'administrator')
      throw new BadRequestException('Administrator is reserved; use a different role key');
    return this.db.$transaction(
      async (tx) => {
        const existing = await tx.role.findUnique({ where: { key } });
        if (
          existing?.permissions.includes('roles.manage') &&
          !dto.permissions.includes('roles.manage') &&
          (await tx.user.count({
            where: {
              status: 'ACTIVE',
              roles: {
                some: {
                  roleId: { not: existing.id },
                  role: { permissions: { has: 'roles.manage' } },
                },
              },
            },
          })) === 0
        )
          throw new BadRequestException('Keep an active role administrator');
        const result = await tx.role.upsert({
          where: { key },
          create: { key, ...dto },
          update: dto,
        });
        await tx.auditLog.create({
          data: {
            actorId: req.account.id,
            action: 'role.save',
            targetId: result.id,
            reason: 'Role permissions updated',
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  @Put('users/:id/roles') @RequirePermission('roles.manage') async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RolesDto,
    @Req() req: AuthRequest,
  ) {
    return this.db.$transaction(
      async (tx) => {
        if (!(await tx.user.findUnique({ where: { id } }))) throw new NotFoundException();
        const roles = await tx.role.findMany({ where: { id: { in: dto.roleIds } } });
        if (roles.length !== dto.roleIds.length) throw new BadRequestException('Unknown role');
        if (!roles.some((r) => r.permissions.includes('roles.manage')))
          await this.otherAdministrator(tx, id);
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
        });
        await tx.auditLog.create({
          data: {
            actorId: req.account.id,
            action: 'roles.assign',
            targetId: id,
            reason: 'Account role assignment updated',
          },
        });
        return { ok: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  @Get('menus') @RequirePermission('menus.manage') menus() {
    return this.db.menu.findMany({ orderBy: { position: 'asc' } });
  }
  @Put('menus/:key') @RequirePermission('menus.manage') async menu(
    @Param('key') key: string,
    @Body() dto: MenuDto,
    @Req() req: AuthRequest,
  ) {
    if (!/^[a-z0-9-]{2,50}$/.test(key)) throw new BadRequestException('Invalid menu key');
    return this.db.$transaction(async (tx) => {
      const row = await tx.menu.upsert({
        where: { key },
        create: { key, ...dto },
        update: { ...dto, permission: dto.permission ?? null },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'menu.save',
          targetId: key,
          reason: 'Navigation updated',
        },
      });
      return row;
    });
  }
  @Get('audit') @RequirePermission('moderation.manage') audit() {
    return this.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
  @Get('communities') @RequirePermission('communities.manage') listCommunities() {
    return this.db.community.findMany({ orderBy: { name: 'asc' } });
  }
  @Put('communities/:id') @RequirePermission('communities.manage') async community(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommunityDto,
    @Req() req: AuthRequest,
  ) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.community.upsert({ where: { id }, create: { id, ...dto }, update: dto });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'community.save',
          targetId: id,
          reason: 'Community settings updated',
        },
      });
      return row;
    });
  }
  @Put('topics/:id') @RequirePermission('topics.manage') topic(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TopicDto,
  ) {
    return this.db.topic.upsert({ where: { id }, create: { id, ...dto }, update: dto });
  }
}
