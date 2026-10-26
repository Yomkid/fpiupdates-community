import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { safetyTransaction } from './safety-transaction';
import { Database } from './database';
import { AuthRequest, publicUser, SessionGuard } from './auth';
@Controller('safety')
@UseGuards(SessionGuard)
export class SafetyController {
  constructor(private readonly db: Database) {}
  @Get() async list(@Req() req: AuthRequest, @Query('before') before?: string) {
    if (before && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(before))
      throw new BadRequestException('Invalid cursor');
    // UUID ordering is stable; pages include both kinds and do not reveal who blocked the viewer.
    const filter = before ? { lt: before } : undefined;
    const user = req.account.id;
    const [blocks, mutes] = await Promise.all([
      this.db.block.findMany({
        where: { blockerId: user, blockedId: filter },
        orderBy: { blockedId: 'desc' },
        take: 101,
        select: { blocked: { select: publicUser }, createdAt: true },
      }),
      this.db.mute.findMany({
        where: { muterId: user, mutedId: filter },
        orderBy: { mutedId: 'desc' },
        take: 101,
        select: { muted: { select: publicUser }, createdAt: true },
      }),
    ]);
    const ids = [...blocks.map((x) => x.blocked.id), ...mutes.map((x) => x.muted.id)]
      .sort()
      .reverse();
    const cutoff = ids[99];
    const more = ids.length > 100;
    return {
      blocks: blocks.filter((x) => !more || x.blocked.id >= cutoff),
      mutes: mutes.filter((x) => !more || x.muted.id >= cutoff),
      nextCursor: more ? cutoff : null,
    };
  }
  @Get('users/:id') async state(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    const user = req.account.id;
    return {
      blocked: !!(await this.db.block.findUnique({
        where: { blockerId_blockedId: { blockerId: user, blockedId: id } },
      })),
      muted: !!(await this.db.mute.findUnique({
        where: { muterId_mutedId: { muterId: user, mutedId: id } },
      })),
    };
  }
  @Put('blocks/:id') async block(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    await this.target(id, req.account.id);
    await safetyTransaction(this.db, async (tx) => {
      await tx.block.upsert({
        where: { blockerId_blockedId: { blockerId: req.account.id, blockedId: id } },
        create: { blockerId: req.account.id, blockedId: id },
        update: {},
      });
      await tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: req.account.id, followingId: id },
            { followerId: id, followingId: req.account.id },
          ],
        },
      });
    });
    return { ok: true };
  }
  @Delete('blocks/:id') async unblock(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    await this.db.block.deleteMany({ where: { blockerId: req.account.id, blockedId: id } });
    return { ok: true };
  }
  @Put('mutes/:id') async mute(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    await this.target(id, req.account.id);
    await this.db.mute.upsert({
      where: { muterId_mutedId: { muterId: req.account.id, mutedId: id } },
      create: { muterId: req.account.id, mutedId: id },
      update: {},
    });
    return { ok: true };
  }
  @Delete('mutes/:id') async unmute(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    await this.db.mute.deleteMany({ where: { muterId: req.account.id, mutedId: id } });
    return { ok: true };
  }
  private async target(id: string, viewer: string) {
    if (id === viewer) throw new BadRequestException('Choose another account');
    if (!(await this.db.user.findUnique({ where: { id } })))
      throw new NotFoundException('Account not found');
  }
}
