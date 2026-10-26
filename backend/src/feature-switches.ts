import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Header,
  Injectable,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn } from 'class-validator';
import { Database } from './database';
import { AuthRequest, SessionGuard } from './auth';
import { PermissionGuard, RequirePermission } from './permissions';
export const featureKeys = [
  'postImages',
  'sports',
  'messages',
  'articlePublishing',
  'advertising',
  'identityBadgeColours',
  'organisationAvatars',
] as const;
const defaultEnabled = (key: FeatureKey) =>
  !['advertising', 'identityBadgeColours', 'organisationAvatars'].includes(key);
export type FeatureKey = (typeof featureKeys)[number];
@Injectable()
export class FeatureSwitches {
  constructor(private readonly db: Database) {}
  async all() {
    const rows = await this.db.featureSwitch.findMany();
    return Object.fromEntries(
      featureKeys.map((k) => [k, rows.find((r) => r.key === k)?.enabled ?? defaultEnabled(k)]),
    ) as Record<FeatureKey, boolean>;
  }
  async enabled(key: FeatureKey) {
    return (
      (await this.db.featureSwitch.findUnique({ where: { key } }))?.enabled ?? defaultEnabled(key)
    );
  }
}
class SwitchDto {
  @IsIn(featureKeys) key!: FeatureKey;
  @IsBoolean() enabled!: boolean;
}
@Controller('features')
export class FeatureSwitchController {
  constructor(
    private readonly db: Database,
    private readonly switches: FeatureSwitches,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') async read() {
    return {
      ...(await this.switches.all()),
      uploadsAvailable: process.env.MEDIA_UPLOADS_DISABLED !== 'true',
    };
  }
  @Put() @UseGuards(SessionGuard, PermissionGuard) @RequirePermission('features.manage') async save(
    @Body() dto: SwitchDto,
    @Req() req: AuthRequest,
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.featureSwitch.upsert({
        where: { key: dto.key },
        create: dto,
        update: { enabled: dto.enabled },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'features.update',
          targetId: dto.key,
          reason: dto.enabled ? 'Enabled' : 'Disabled',
        },
      });
    });
    return this.switches.all();
  }
  @Put('text-first')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission('features.manage')
  async textFirst(@Req() req: AuthRequest) {
    await this.db.$transaction(async (tx) => {
      for (const key of ['postImages', 'sports', 'messages'])
        await tx.featureSwitch.upsert({
          where: { key },
          create: { key, enabled: false },
          update: { enabled: false },
        });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'features.text-first',
          targetId: 'platform',
          reason: 'Text-first launch preset: pause new post images, sports and messages',
        },
      });
    });
    return this.switches.all();
  }
}
@Injectable()
export class FeatureAccessGuard implements CanActivate {
  constructor(private readonly switches: FeatureSwitches) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (
      req.method === 'POST' &&
      context.getClass().name === 'MediaController' &&
      process.env.MEDIA_UPLOADS_DISABLED === 'true'
    )
      throw new ForbiddenException('Uploads are paused on this test server');
    const path = req.path.toLowerCase().replace(/^\/api\/v1/, '');
    const mediaKind = String(req.params?.kind ?? '').toLowerCase();
    let key: FeatureKey | undefined;
    if (/^\/sports(?:-desk)?(?:\/|$)/.test(path)) key = 'sports';
    if (/^\/ads(?:\/|$)/.test(path)) key = 'advertising';
    if (/^\/messages(?:\/|$)/.test(path)) key = 'messages';
    if (/^\/(editorial|publishing)(?:\/|$)/.test(path)) key = 'articlePublishing';
    if (path.startsWith('/media/') && mediaKind === 'post' && req.method === 'POST')
      key = 'postImages';
    if (path.startsWith('/media/') && mediaKind === 'sport' && req.method === 'POST')
      key = 'sports';
    if (path.startsWith('/media/') && mediaKind === 'cover' && req.method === 'POST')
      key = 'articlePublishing';
    if (key && !(await this.switches.enabled(key)))
      throw new ForbiddenException('This feature is not currently available');
    if (
      req.method === 'POST' &&
      /^\/posts(?:\/thread)?$/.test(path) &&
      req.body?.imageMediaId &&
      !(await this.switches.enabled('postImages'))
    )
      throw new ForbiddenException('Post image uploads are currently disabled');
    if (
      req.method === 'POST' &&
      /^\/posts(?:\/thread)?$/.test(path) &&
      (req.body?.sportsMatchId || req.body?.sportsCompetitionId) &&
      !(await this.switches.enabled('sports'))
    )
      throw new ForbiddenException('Sports discussions are currently disabled');
    return true;
  }
}
