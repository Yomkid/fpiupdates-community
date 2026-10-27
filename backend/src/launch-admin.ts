import { BadRequestException, Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsISO8601, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Database } from './database';
import { AuthRequest, SessionGuard } from './auth';
import { PermissionGuard, RequirePermission } from './permissions';
import { PUBLIC_LAUNCH_PAGES } from './launch-gate';
class LaunchSettingsDto {
  @IsIn(['OPEN', 'COUNTDOWN', 'MAINTENANCE']) mode!: string;
  @IsISO8601({ strict: true }) launchAt!: string;
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsString() @MaxLength(500) message!: string;
  @IsArray() @ArrayMaxSize(4) @IsIn(PUBLIC_LAUNCH_PAGES, { each: true }) allowedPages!: string[];
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { each: true }) allowedUserIds!: string[];
}
@Controller('admin/launch')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('features.manage')
export class LaunchAdminController {
  constructor(private readonly db: Database) {}
  @Get() async get() { const settings = await this.db.launchControl.findUniqueOrThrow({ where: { id: 'platform' } }); const allowedUsers = await this.db.user.findMany({ where: { id: { in: settings.allowedUserIds } }, select: { id: true, username: true, displayName: true, avatarMediaId: true, identityStatus: true, identityCategory: true } }); return { ...settings, allowedUserIds: allowedUsers.map(user => user.id), allowedUsers, gateEnabled: process.env.LAUNCH_GATE_ENABLED === 'true' }; }
  @Get('users') async users(@Query('q') q = '') {
    const search = q.trim().replace(/^@/, '').slice(0, 80);
    if (search.length < 2) return [];
    return this.db.user.findMany({ where: { status: 'ACTIVE', OR: [{ username: { contains: search, mode: 'insensitive' } }, { displayName: { contains: search, mode: 'insensitive' } }] }, take: 20, select: { id: true, username: true, displayName: true, avatarMediaId: true, identityStatus: true, identityCategory: true } });
  }
  @Put() async update(@Body() dto: LaunchSettingsDto, @Req() req: AuthRequest) {
    const ids = [...new Set(dto.allowedUserIds)], pages = [...new Set(dto.allowedPages)];
    const launchAt = new Date(dto.launchAt);
    if (!Number.isFinite(launchAt.getTime())) throw new BadRequestException('Invalid launch date');
    if (ids.length !== await this.db.user.count({ where: { id: { in: ids }, status: 'ACTIVE' } })) throw new BadRequestException('One or more selected accounts are unavailable');
    return this.db.$transaction(async tx => {
      const result = await tx.launchControl.update({ where: { id: 'platform' }, data: { mode: dto.mode, launchAt, title: dto.title.trim(), message: dto.message.trim(), allowedPages: pages, allowedUserIds: ids } });
      await tx.auditLog.create({ data: { actorId: req.account.id, action: 'launch.settings.update', targetId: 'platform', reason: `Mode: ${dto.mode}; launch: ${launchAt.toISOString()}; public pages: ${pages.join(', ') || 'none'}; tester accounts: ${ids.length}` } });
      return result;
    });
  }
}
