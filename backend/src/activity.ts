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
  ForbiddenException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthRequest, SessionGuard } from './auth';
import { Database } from './database';
import { notificationVisibility } from './notifications';
import { decodeCursor, postFields, PostsService } from './posts';
import { postVisibility, visibleAuthor } from './post-visibility';
import { safetyTransaction } from './safety-transaction';
class GroupQuery {
  @IsOptional() @IsIn(['all', 'unread', 'mentions']) filter?: string;
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
class ReadDto {
  @IsISO8601({ strict: true }) through!: string;
}
export async function groupedUnread(db: Database, viewer: string) {
  return (
    await db.notification.groupBy({
      by: ['groupKey'],
      where: { AND: [notificationVisibility(viewer), { readAt: null }] },
    })
  ).length;
}
const fields = {
  id: true,
  groupKey: true,
  activityKind: true,
  kind: true,
  createdAt: true,
  readAt: true,
  contextPost: { select: { parentId: true } },
  actor: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarMediaId: true,
      identityStatus: true,
      identityCategory: true,
    },
  },
  post: {
    select: {
      id: true,
      body: true,
      parentId: true,
      imageMediaId: true,
      article: { select: { slug: true, title: true, coverMediaId: true } },
    },
  },
} as const;
const href = (post: { id: string; article: { slug: string } | null } | null, username: string) =>
  post ? (post.article ? '/articles/' + post.article.slug : '/posts/' + post.id) : '/u/' + username;
@Controller('notification-groups')
@UseGuards(SessionGuard)
export class ActivityController {
  constructor(
    private readonly db: Database,
    private readonly posts: PostsService,
  ) {}
  @Get() async list(@Query() q: GroupQuery, @Req() req: AuthRequest) {
    const asOf = new Date();
    const where: Prisma.NotificationWhereInput = {
      AND: [
        notificationVisibility(req.account.id),
        { createdAt: { lte: asOf } },
        ...(q.filter === 'unread'
          ? [{ readAt: null }]
          : q.filter === 'mentions'
            ? [{ kind: 'MENTION' as const }]
            : []),
      ],
    };
    let cursor: { key: string; at: Date } | undefined;
    if (q.cursor)
      try {
        const v = JSON.parse(Buffer.from(q.cursor, 'base64url').toString());
        if (
          typeof v.key !== 'string' ||
          v.key.length > 200 ||
          typeof v.at !== 'string' ||
          !Number.isFinite(Date.parse(v.at))
        )
          throw Error();
        cursor = { key: v.key, at: new Date(v.at) };
      } catch {
        throw new BadRequestException('Invalid activity cursor');
      }
    const groups = await this.db.notification.groupBy({
      by: ['groupKey'],
      where,
      _max: { createdAt: true },
      orderBy: [{ _max: { createdAt: 'desc' } }, { groupKey: 'desc' }],
      ...(cursor
        ? {
            having: {
              OR: [
                { createdAt: { _max: { lt: cursor.at } } },
                { createdAt: { _max: { equals: cursor.at } }, groupKey: { lt: cursor.key } },
              ],
            },
          }
        : {}),
      take: q.limit + 1,
    });
    const pageKeys = groups.slice(0, q.limit).map((g) => g.groupKey);
    const visiblePage: Prisma.NotificationWhereInput = {
      AND: [
        notificationVisibility(req.account.id),
        { groupKey: { in: pageKeys }, createdAt: { lte: asOf } },
      ],
    };
    const [actorGroups, targetGroups, unreadGroups] = await Promise.all([
      this.db.notification.groupBy({
        by: ['groupKey', 'actorId'],
        where: visiblePage,
        _count: { _all: true },
      }),
      this.db.notification.groupBy({ by: ['groupKey', 'postId'], where: visiblePage }),
      this.db.notification.groupBy({
        by: ['groupKey'],
        where: { AND: [visiblePage, { readAt: null }] },
      }),
    ]);
    const targetTypes = await this.db.post.findMany({
      where: { id: { in: targetGroups.flatMap((t) => (t.postId ? [t.postId] : [])) } },
      select: { id: true, parentId: true },
    });
    const data = await Promise.all(
      groups.slice(0, q.limit).map(async (group) => {
        const rows = await this.db.notification.findMany({
          where: { AND: [visiblePage, { groupKey: group.groupKey }] },
          select: fields,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          distinct: ['actorId'],
          take: 8,
        });
        const row = rows[0];
        if (!row) return null;
        const people = actorGroups.filter((g) => g.groupKey === group.groupKey),
          targets = targetGroups.filter((g) => g.groupKey === group.groupKey && g.postId);
        const conversation =
          row.post && ['REPLY', 'MENTION'].includes(row.kind)
            ? await this.db.post.findFirst({
                where: { AND: [postVisibility(req.account.id, true), { id: row.post.id }] },
                select: postFields(req.account.id),
              })
            : null;
        const conversationPost = conversation
          ? (await this.posts.project([conversation], req.account.id))[0]
          : null;
        return {
          ...row,
          conversationPost,
          eventCount: people.reduce((sum, p) => sum + p._count._all, 0),
          actorCount: people.length,
          postCount: targets.length,
          replyTargetCount: targets.filter(
            (t) => targetTypes.find((p) => p.id === t.postId)?.parentId,
          ).length,
          targetIsReply: !!row.contextPost?.parentId,
          thumbnailMediaId: row.post?.imageMediaId ?? row.post?.article?.coverMediaId ?? null,
          actors: rows.map((n) => n.actor),
          readAt: unreadGroups.some((g) => g.groupKey === group.groupKey) ? null : row.readAt,
          preview: row.post ? (row.post.article?.title ?? row.post.body).slice(0, 180) : null,
          href:
            row.kind === 'POST_ALERT'
              ? '/notifications/posts'
              : (row.kind === 'LIKE' && targets.length > 1) ||
                  (row.kind === 'FOLLOW' && people.length > 1)
                ? '/notifications/activity/' + row.id
                : href(row.post, row.actor.username),
          post: undefined,
          contextPost: undefined,
        };
      }),
    );
    const last = groups.slice(0, q.limit).at(-1);
    return {
      data: data.filter((row) => row !== null),
      nextCursor:
        groups.length > q.limit && last
          ? Buffer.from(
              JSON.stringify({ key: last.groupKey, at: last._max.createdAt!.toISOString() }),
            ).toString('base64url')
          : null,
      unreadCount: await groupedUnread(this.db, req.account.id),
      asOf: asOf.toISOString(),
    };
  }
  @Put('read-all') async all(@Body() dto: ReadDto, @Req() req: AuthRequest) {
    const through = new Date(dto.through);
    if (through.getTime() > Date.now() + 1000) throw new BadRequestException('Invalid boundary');
    await this.db.notification.updateMany({
      where: {
        AND: [
          notificationVisibility(req.account.id),
          { readAt: null, createdAt: { lte: through } },
        ],
      },
      data: { readAt: new Date() },
    });
    return { unreadCount: await groupedUnread(this.db, req.account.id) };
  }
  @Put(':id/read') async read(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReadDto,
    @Req() req: AuthRequest,
  ) {
    const row = await this.row(id, req.account.id);
    if (dto.through !== row.createdAt.toISOString())
      throw new BadRequestException('Reload this notification');
    await this.db.notification.updateMany({
      where: {
        AND: [
          notificationVisibility(req.account.id),
          { groupKey: row.groupKey, readAt: null },
          {
            OR: [
              { createdAt: { lt: row.createdAt } },
              { createdAt: row.createdAt, id: { lte: row.id } },
            ],
          },
        ],
      },
      data: { readAt: new Date() },
    });
    return { unreadCount: await groupedUnread(this.db, req.account.id) };
  }
  @Get('posts') async subscribed(@Query() q: GroupQuery, @Req() req: AuthRequest) {
    const c = q.cursor ? decodeCursor(q.cursor) : null;
    const records = await this.db.notification.findMany({
      where: {
        AND: [
          notificationVisibility(req.account.id),
          {
            kind: 'POST_ALERT',
            actor: { followers: { some: { followerId: req.account.id, postAlerts: true } } },
          },
          ...(c
            ? [
                {
                  OR: [
                    { createdAt: { lt: c.createdAt } },
                    { createdAt: c.createdAt, id: { lt: c.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { ...fields, post: { select: postFields(req.account.id) } },
      take: q.limit + 1,
    });
    const page = records.slice(0, q.limit);
    const projected = await this.posts.project(
      page.flatMap((r) => (r.post ? [r.post] : [])),
      req.account.id,
    );
    const last = page.at(-1);
    return {
      data: page.map((r) => {
        const p = projected.find((p) => p.id === r.post?.id);
        return {
          id: r.id,
          kind: r.activityKind ?? r.kind,
          createdAt: r.createdAt,
          post: p
            ? { ...p, feedId: r.id, repostedBy: r.activityKind === 'REPOST' ? r.actor : null }
            : null,
        };
      }),
      nextCursor:
        records.length > q.limit && last
          ? Buffer.from(JSON.stringify({ id: last.id, at: last.createdAt.toISOString() })).toString(
              'base64url',
            )
          : null,
    };
  }
  @Get(':id') async timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: GroupQuery,
    @Req() req: AuthRequest,
  ) {
    const row = await this.row(id, req.account.id);
    const c = q.cursor ? decodeCursor(q.cursor) : null;
    const records = await this.db.notification.findMany({
      where: {
        AND: [
          notificationVisibility(req.account.id),
          { groupKey: row.groupKey },
          ...(c
            ? [
                {
                  OR: [
                    { createdAt: { lt: c.createdAt } },
                    { createdAt: c.createdAt, id: { lt: c.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { ...fields, post: { select: postFields(req.account.id) } },
      take: q.limit + 1,
    });
    const page = records.slice(0, q.limit);
    const posts = await this.posts.project(
      page.flatMap((r) => (r.post ? [r.post] : [])),
      req.account.id,
    );
    const last = page.at(-1);
    return {
      actor: row.actor,
      data: page.map((r) => ({
        id: r.id,
        actor: r.actor,
        kind: r.activityKind ?? r.kind,
        createdAt: r.createdAt,
        post: posts.find((p) => p.id === r.post?.id)
          ? {
              ...posts.find((p) => p.id === r.post?.id)!,
              feedId: r.id,
              repostedBy: r.activityKind === 'REPOST' ? r.actor : null,
            }
          : null,
      })),
      nextCursor:
        records.length > q.limit && last
          ? Buffer.from(JSON.stringify({ id: last.id, at: last.createdAt.toISOString() })).toString(
              'base64url',
            )
          : null,
    };
  }
  private async row(id: string, viewer: string) {
    const row = await this.db.notification.findFirst({
      where: { AND: [notificationVisibility(viewer), { id }] },
      select: fields,
    });
    if (!row) throw new NotFoundException('Activity unavailable');
    return row;
  }
}
@Controller('profile-alerts')
@UseGuards(SessionGuard)
export class ProfileAlertsController {
  constructor(private readonly db: Database) {}
  @Get(':id') async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    const follow = await this.db.follow.findUnique({
      where: { followerId_followingId: { followerId: req.account.id, followingId: id } },
    });
    return { following: !!follow, enabled: follow?.postAlerts ?? false };
  }
  @Put(':id/:state') async set(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('state') state: string,
    @Req() req: AuthRequest,
  ) {
    if (!['on', 'off'].includes(state)) throw new BadRequestException();
    return safetyTransaction(this.db, async (tx) => {
      if (!(await tx.user.findFirst({ where: { AND: [visibleAuthor(req.account.id), { id }] } })))
        throw new NotFoundException();
      const result = await tx.follow.updateMany({
        where: { followerId: req.account.id, followingId: id },
        data: { postAlerts: state === 'on' },
      });
      if (!result.count)
        throw new ForbiddenException('Follow this account before enabling post alerts');
      return { following: true, enabled: state === 'on' };
    });
  }
}
