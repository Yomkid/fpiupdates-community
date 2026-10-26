import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsOptional,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import { AuthRequest, OptionalSessionGuard, SessionGuard } from './auth';
import { PermissionGuard, RequirePermission } from './permissions';
import { postVisibility, visibleAuthor } from './post-visibility';

export function trendScore(authors: number, recentAuthors: number, ageHours: number) {
  return (authors + recentAuthors * 2) / Math.pow(1 + Math.max(0, ageHours) / 6, 1.2);
}
export class DiscoveryCardDto {
  @IsOptional() @IsBoolean() sidebar?: boolean;
  @IsOptional() @IsBoolean() feed?: boolean;
  @IsOptional() @IsBoolean() desktop?: boolean;
  @IsOptional() @IsBoolean() mobile?: boolean;
  @IsIn(['ANNOUNCEMENT', 'SPONSORED', 'TOPIC']) kind!: string;
  @IsString() @MinLength(1) @MaxLength(100) title!: string;
  @IsString() @MaxLength(400) body!: string;
  @IsString() @MaxLength(500) href!: string;
  @IsBoolean() enabled!: boolean;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsInt() @Min(0) @Max(100) position!: number;
}
export function validCardLink(href: string) {
  if (/^\/(?!\/)[a-zA-Z0-9/?#=&%_.~-]*$/.test(href) && !/%(?:5c|0a|0d)/i.test(href)) return true;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}
export class DisplayQuery {
  @IsOptional() @IsIn(['sidebar', 'feed']) placement: 'sidebar' | 'feed' = 'sidebar';
  @IsOptional() @IsIn(['desktop', 'mobile']) device: 'desktop' | 'mobile' = 'desktop';
}
@Controller('discovery')
export class DiscoveryFeedController {
  constructor(private readonly db: Database) {}
  @Get('sidebar')
  @UseGuards(OptionalSessionGuard)
  async sidebar(@Req() req: AuthRequest, @Query() q: DisplayQuery) {
    const now = new Date();
    const viewer = req.account?.id ?? null;
    const cards = await this.db.discoveryCard.findMany({
      where: {
        enabled: true,
        [q.device]: true,
        [q.placement]: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    // Each author contributes once per tag in each window. Reposts do not create tokens.
    const rows = await this.db.$queryRaw<
      { tag: string; posts: bigint; authors: bigint; recent: bigint; age: number }[]
    >(Prisma.sql`
   SELECT t.hashtag AS tag,count(DISTINCT p.id) AS posts,count(DISTINCT p."authorId") AS authors,
    count(DISTINCT p."authorId") FILTER (WHERE p."createdAt">${new Date(now.getTime() - 3 * 3600000)}) AS recent,
    extract(epoch FROM (${now}::timestamp-max(p."createdAt")))/3600 AS age
   FROM "PostToken" t JOIN "Post" p ON p.id=t."postId" JOIN "User" u ON u.id=p."authorId"
   LEFT JOIN "SportsCompetition" sc ON sc.id=p."sportsCompetitionId"
   LEFT JOIN "Community" c ON c.id=p."communityId" LEFT JOIN "Article" a ON a."discussionPostId"=p.id
   LEFT JOIN "User" au ON au.id=a."authorId" LEFT JOIN "User" owner ON owner.id=p."replyPolicyOwnerId"
   WHERE t.kind='HASHTAG' AND t.hashtag IS NOT NULL AND p."createdAt">${new Date(now.getTime() - 24 * 3600000)}
    AND p."createdAt"<=${now} AND p.status='PUBLISHED' AND p."deletedAt" IS NULL AND u.status='ACTIVE'
    AND (p."sportsCompetitionId" IS NULL OR sc.published=true)
    AND (p."communityId" IS NULL OR c.active=true)
    AND (a.id IS NULL OR (a.status='PUBLISHED' AND au.status='ACTIVE'))
    AND (p."replyPolicyOwnerId" IS NULL OR owner.status='ACTIVE')
    AND (${viewer}::uuid IS NULL OR (
     NOT EXISTS (SELECT 1 FROM "Block" b WHERE (b."blockerId"=${viewer}::uuid AND b."blockedId" IN (u.id,au.id,owner.id)) OR (b."blockedId"=${viewer}::uuid AND b."blockerId" IN (u.id,au.id,owner.id)))
     AND NOT EXISTS (SELECT 1 FROM "Mute" m WHERE m."muterId"=${viewer}::uuid AND m."mutedId" IN (u.id,au.id))))
   GROUP BY t.hashtag HAVING count(DISTINCT p."authorId")>=3
   ORDER BY count(DISTINCT p."authorId") DESC,t.hashtag ASC LIMIT 100`);
    const trends = rows
      .map((r) => ({
        tag: r.tag,
        posts: Number(r.posts),
        authors: Number(r.authors),
        score: trendScore(Number(r.authors), Number(r.recent), Number(r.age)),
      }))
      .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
      .slice(0, 5)
      .map(({ score, ...r }) => r);
    const articles = await this.db.article.findMany({
      where: {
        status: 'PUBLISHED',
        author: visibleAuthor(req.account?.id, true),
        discussionPost: postVisibility(req.account?.id, true),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 3,
      select: {
        id: true,
        slug: true,
        title: true,
        publishedAt: true,
        coverMediaId: true,
        coverAlt: true,
      },
    });
    const topics = cards.filter((c) => c.kind === 'TOPIC').slice(0, 5);
    const fallback = topics.length
      ? topics
      : await this.db.topic
          .findMany({ orderBy: { name: 'asc' }, take: 5 })
          .then((ts) =>
            ts.map((t) => ({
              id: t.id,
              title: t.name,
              body: 'Community interest',
              href: '/search?topicId=' + t.id,
            })),
          );
    return {
      announcement: cards.find((c) => c.kind === 'ANNOUNCEMENT') ?? null,
      sponsored: cards.find((c) => c.kind === 'SPONSORED') ?? null,
      trends,
      topics: trends.length ? [] : fallback,
      articles,
      windowHours: 24,
      updatedAt: now,
    };
  }
}
@Controller('admin/discovery')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('discovery.manage')
export class DiscoveryAdminController {
  constructor(private readonly db: Database) {}
  @Get() list() {
    return this.db.discoveryCard.findMany({
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: 100,
    });
  }
  @Put(':id') async save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DiscoveryCardDto,
    @Req() req: AuthRequest,
  ) {
    if (!validCardLink(dto.href))
      throw new BadRequestException('Use a local page path or a complete HTTPS link');
    if (dto.kind === 'ANNOUNCEMENT' && dto.sidebar === false && dto.feed === false)
      throw new BadRequestException('Choose a feed or sidebar placement');
    if (dto.desktop === false && dto.mobile === false)
      throw new BadRequestException('Choose mobile or desktop visibility');
    const startsAt = new Date(dto.startsAt),
      endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('End must be after start');
    const data = { ...dto, title: dto.title.trim(), startsAt, endsAt };
    if (!data.title) throw new BadRequestException('Title required');
    return this.db.$transaction(async (tx) => {
      const old = await tx.discoveryCard.findUnique({ where: { id } });
      const merged = {
        ...old,
        ...data,
        sidebar: dto.sidebar ?? old?.sidebar ?? true,
        feed: dto.feed ?? old?.feed ?? false,
        desktop: dto.desktop ?? old?.desktop ?? true,
        mobile: dto.mobile ?? old?.mobile ?? true,
      };
      if (merged.kind === 'ANNOUNCEMENT' && !merged.sidebar && !merged.feed)
        throw new BadRequestException('Choose feed or sidebar placement');
      if (!merged.desktop && !merged.mobile)
        throw new BadRequestException('Choose mobile or desktop visibility');
      const card = await tx.discoveryCard.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'discovery.save',
          targetId: id,
          reason: `${dto.kind}: ${dto.enabled ? 'enabled' : 'disabled'}`,
        },
      });
      return card;
    });
  }
}
