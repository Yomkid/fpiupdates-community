import { groupedUnread } from './activity';
import { SkipThrottle } from '@nestjs/throttler';
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
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Prisma } from '@prisma/client';
import { AuthRequest, SessionGuard } from './auth';
import { Database } from './database';
import { postVisibility, visibleAuthor } from './post-visibility';
import { decodeCursor } from './posts';
class NotificationQuery {
  @IsOptional() @IsIn(['all', 'unread']) filter?: string;
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
class SyncQuery {
  @IsOptional() @IsIn(['true']) grouped?: string;
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
}
class ReadAllDto {
  @IsISO8601({ strict: true }) through!: string;
}
export function notificationVisibility(viewer: string): Prisma.NotificationWhereInput {
  return {
    recipientId: viewer,
    actor: visibleAuthor(viewer, true),
    OR: [
      { kind: 'FOLLOW', postId: null, contextPostId: null },
      {
        kind: { in: ['LIKE', 'REPLY', 'REPOST', 'QUOTE', 'MENTION', 'POST_ALERT'] },
        post: postVisibility(viewer, true),
        contextPost: postVisibility(viewer, true),
      },
    ],
  };
}
const fields = {
  id: true,
  kind: true,
  createdAt: true,
  readAt: true,
  actor: { select: { id: true, username: true, displayName: true, avatarMediaId: true } },
  post: { select: { id: true, body: true, article: { select: { slug: true, title: true } } } },
} as const;
@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly db: Database) {}
  @Get('sync') @SkipThrottle({ default: true }) async sync(
    @Query() q: SyncQuery,
    @Req() req: AuthRequest,
  ) {
    const viewer = req.account.id;
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const newer: Prisma.NotificationWhereInput = cursor
      ? {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        }
      : {};
    const where = { AND: [notificationVisibility(viewer), newer] };
    const latest = await this.db.notification.findFirst({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true },
    });
    const desktop =
      latest && cursor
        ? await this.db.notification.findFirst({
            where: { AND: [where, { readAt: null }] },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: {
              ...fields,
              actor: {
                select: { id: true, displayName: true, username: true, avatarMediaId: true },
              },
            },
          })
        : null;
    return {
      desktop: desktop
        ? {
            kind: desktop.kind,
            actor: desktop.actor,
            preview: desktop.post
              ? (desktop.post.article?.title ?? desktop.post.body).slice(0, 280)
              : null,
            href:
              desktop.kind === 'POST_ALERT'
                ? '/notifications/posts'
                : desktop.post
                  ? desktop.post.article
                    ? '/articles/' + desktop.post.article.slug
                    : '/posts/' + desktop.post.id
                  : '/u/' + desktop.actor.username,
          }
        : null,
      unreadCount: q.grouped ? await groupedUnread(this.db, viewer) : await this.count(viewer),
      newCount: cursor
        ? q.grouped
          ? (
              await this.db.notification.groupBy({
                by: ['groupKey'],
                where: { AND: [where, { readAt: null }] },
              })
            ).length
          : await this.db.notification.count({ where: { AND: [where, { readAt: null }] } })
        : 0,
      cursor: latest
        ? Buffer.from(
            JSON.stringify({ id: latest.id, at: latest.createdAt.toISOString() }),
          ).toString('base64url')
        : (q.cursor ??
          Buffer.from(
            JSON.stringify({
              id: '00000000-0000-0000-0000-000000000000',
              at: new Date().toISOString(),
            }),
          ).toString('base64url')),
    };
  }
  @Get('unread-count') async unread(@Req() req: AuthRequest) {
    return { unreadCount: await this.count(req.account.id) };
  }
  @Get() async list(@Query() q: NotificationQuery, @Req() req: AuthRequest) {
    const asOf = new Date();
    const viewer = req.account.id;
    const conditions: Prisma.NotificationWhereInput[] = [notificationVisibility(viewer)];
    if (q.filter === 'unread') conditions.push({ readAt: null });
    if (q.cursor) {
      const cursor = decodeCursor(q.cursor);
      conditions.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    const rows = await this.db.notification.findMany({
      where: { AND: conditions },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      select: fields,
    });
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      data: page.map(({ post, ...row }) => ({
        ...row,
        preview: post ? (post.article?.title ?? post.body).slice(0, 180) : null,
        href: post
          ? post.article
            ? '/articles/' + post.article.slug
            : '/posts/' + post.id
          : '/u/' + row.actor.username,
      })),
      nextCursor:
        rows.length > q.limit && last
          ? Buffer.from(JSON.stringify({ id: last.id, at: last.createdAt.toISOString() })).toString(
              'base64url',
            )
          : null,
      unreadCount: await this.count(viewer),
      asOf: asOf.toISOString(),
    };
  }
  @Put('read-all') async readAll(@Body() dto: ReadAllDto, @Req() req: AuthRequest) {
    const through = new Date(dto.through);
    if (through.getTime() > Date.now() + 1000)
      throw new BadRequestException('Invalid read boundary');
    const result = await this.db.notification.updateMany({
      where: {
        AND: [
          notificationVisibility(req.account.id),
          { readAt: null, createdAt: { lte: through } },
        ],
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count, unreadCount: await this.count(req.account.id) };
  }
  @Put(':id/read') async read(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    const where = { AND: [notificationVisibility(req.account.id), { id }] };
    if (!(await this.db.notification.findFirst({ where, select: { id: true } })))
      throw new NotFoundException('Notification not found');
    await this.db.notification.updateMany({
      where: { AND: [where, { readAt: null }] },
      data: { readAt: new Date() },
    });
    return { unreadCount: await this.count(req.account.id) };
  }
  private count(viewer: string) {
    return this.db.notification.count({
      where: { AND: [notificationVisibility(viewer), { readAt: null }] },
    });
  }
}
