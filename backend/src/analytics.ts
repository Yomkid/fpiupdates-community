import {
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHmac } from 'node:crypto';
import { IsBoolean, IsIn, IsOptional, IsUUID, IsISO8601, Matches } from 'class-validator';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import { AuthRequest, BrowserOriginGuard, OptionalSessionGuard, SessionGuard } from './auth';
import { PermissionGuard, RequirePermission } from './permissions';
import { postVisibility, visibleAuthor } from './post-visibility';
const DAY = 86400000;
export function nigeriaDay(at = new Date()) {
  return new Date(new Date(at.getTime() + 3600000).toISOString().slice(0, 10) + 'T00:00:00Z');
}
export function nigeriaWeek(at = new Date()) {
  const day = nigeriaDay(at);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day;
}
export function statsRange(period = '7d', now = new Date()) {
  const day = nigeriaDay(now);
  const days = period === 'today' ? 1 : period === '30d' ? 30 : 7;
  return {
    period,
    from: period === 'all' ? new Date(0) : new Date(day.getTime() - (days - 1) * DAY - 3600000),
    to: now,
    dayFrom: period === 'all' ? new Date(0) : new Date(day.getTime() - (days - 1) * DAY),
    dayTo: day,
  };
}
class ReportsQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) before?: string;
}
class StatsQuery {
  @IsOptional() @IsIn(['today', '7d', '30d', 'all']) period = '7d';
}
class TrackDto {
  @IsUUID() visitorId!: string;
  @IsUUID() eventId!: string;
  @IsIn(['PAGE', 'PULSE']) kind!: 'PAGE' | 'PULSE';
  @IsIn(['feed', 'articles', 'communities', 'profile', 'search', 'stats', 'other']) page!: string;
  @IsIn(['direct', 'search', 'social', 'referral', 'internal']) source!: string;
}
class SettingsDto {
  @IsBoolean() publicRankings!: boolean;
}
class PreferenceDto {
  @IsBoolean() excludeFromPublicRankings!: boolean;
}
@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private logger = new Logger('Analytics');
  private apiBuffer = new Map<
    string,
    { requests: number; errors: number; ms: number; slow: number }
  >();
  private publicCache = new Map<string, { expires: number; value: unknown }>();
  constructor(private readonly db: Database) {}
  onModuleInit() {
    if (process.env.ANALYTICS_WORKER_DISABLED === 'true') return;
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flushApi();
  }
  recordApi(status: number, ms: number) {
    const key = nigeriaDay().toISOString();
    const row = this.apiBuffer.get(key) ?? { requests: 0, errors: 0, ms: 0, slow: 0 };
    row.requests++;
    row.errors += status >= 500 ? 1 : 0;
    row.ms += Math.max(0, ms);
    row.slow += ms >= 1000 ? 1 : 0;
    this.apiBuffer.set(key, row);
  }
  async flushApi() {
    const entries = [...this.apiBuffer];
    this.apiBuffer.clear();
    for (const [day, r] of entries) {
      try {
        await this.db.analyticsDay.upsert({
          where: { day: new Date(day) },
          create: {
            day: new Date(day),
            apiRequests: r.requests,
            apiErrors: r.errors,
            apiLatencyMs: r.ms,
            slowRequests: r.slow,
          },
          update: {
            apiRequests: { increment: r.requests },
            apiErrors: { increment: r.errors },
            apiLatencyMs: { increment: r.ms },
            slowRequests: { increment: r.slow },
          },
        });
      } catch {
        const current = this.apiBuffer.get(day) ?? { requests: 0, errors: 0, ms: 0, slow: 0 };
        this.apiBuffer.set(day, {
          requests: current.requests + r.requests,
          errors: current.errors + r.errors,
          ms: current.ms + r.ms,
          slow: current.slow + r.slow,
        });
      }
    }
  }
  settings() {
    return this.db.analyticsSettings.findUniqueOrThrow({ where: { key: 'main' } });
  }
  async track(dto: TrackDto, userId?: string) {
    const settings = await this.settings(),
      now = new Date(),
      day = nigeriaDay(now);
    const hash = (value: string) =>
      createHmac('sha256', settings.secret)
        .update(day.toISOString() + ':' + value)
        .digest('hex');
    const visitorHash = hash(dto.visitorId);
    return this.db.$transaction(async (tx) => {
      const visitor = await tx.analyticsVisitorDay.createMany({
        data: [{ day, visitorHash, lastSeen: now }],
        skipDuplicates: true,
      });
      if (!visitor.count)
        await tx.analyticsVisitorDay.update({
          where: { day_visitorHash: { day, visitorHash } },
          data: { lastSeen: now },
        });
      let member = 0;
      if (userId) {
        const result = await tx.analyticsMemberDay.createMany({
          data: [{ day, userId, lastSeen: now }],
          skipDuplicates: true,
        });
        member = result.count;
        if (!member)
          await tx.analyticsMemberDay.update({
            where: { userId_day: { userId, day } },
            data: { lastSeen: now },
          });
        await tx.analyticsMember.upsert({
          where: { userId },
          create: { userId, firstSeen: now, lastSeen: now, daysSeen: member },
          update: { lastSeen: now, daysSeen: { increment: member } },
        });
      }
      const view =
        dto.kind === 'PAGE'
          ? (
              await tx.analyticsHit.createMany({
                data: [{ hash: hash(dto.visitorId + ':' + dto.eventId), day }],
                skipDuplicates: true,
              })
            ).count
          : 0;
      await tx.analyticsDay.upsert({
        where: { day },
        create: { day, visitors: visitor.count, pageViews: view, activeMembers: member },
        update: {
          visitors: { increment: visitor.count },
          pageViews: { increment: view },
          activeMembers: { increment: member },
        },
      });
      if (view)
        await tx.analyticsPageDay.upsert({
          where: { day_page: { day, page: dto.page } },
          create: { day, page: dto.page, views: 1 },
          update: { views: { increment: 1 } },
        });
      if (visitor.count)
        await tx.analyticsSourceDay.upsert({
          where: { day_source: { day, source: dto.source } },
          create: { day, source: dto.source, visitors: 1 },
          update: { visitors: { increment: 1 } },
        });
      return { recorded: true, pageView: !!view };
    });
  }
  async publicSummary(period = '7d') {
    const cached = this.publicCache.get(period);
    if (cached && cached.expires > Date.now()) return cached.value;
    const result = await this.summary(statsRange(period));
    this.publicCache.set(period, { expires: Date.now() + 30000, value: result });
    return result;
  }
  async summary(range: ReturnType<typeof statsRange>) {
    const { from, to, dayFrom, dayTo } = range;
    const date = { gte: from, lt: to };
    const visible = postVisibility();
    const settings = await this.settings();
    const [
      members,
      newMembers,
      posts,
      replies,
      articles,
      likes,
      reposts,
      quotes,
      communities,
      active,
      online,
      days,
      postViews,
    ] = await Promise.all([
      this.db.user.count({ where: { status: 'ACTIVE' } }),
      this.db.user.count({ where: { status: 'ACTIVE', createdAt: date } }),
      this.db.post.count({
        where: { AND: [visible, { parentId: null, article: null, createdAt: date }] },
      }),
      this.db.post.count({
        where: { AND: [visible, { parentId: { not: null }, createdAt: date }] },
      }),
      this.db.article.count({
        where: {
          status: 'PUBLISHED',
          author: { status: 'ACTIVE' },
          discussionPost: visible,
          ...(range.period === 'all' ? {} : { publishedAt: date }),
        },
      }),
      this.db.like.count({ where: { post: visible, user: { status: 'ACTIVE' }, createdAt: date } }),
      this.db.repost.count({
        where: { post: visible, user: { status: 'ACTIVE' }, createdAt: date },
      }),
      this.db.post.count({
        where: { AND: [visible, { quotedPostId: { not: null }, createdAt: date }] },
      }),
      this.db.community.count({ where: { active: true } }),
      range.period === 'all'
        ? this.db.analyticsMember.count({ where: { user: { status: 'ACTIVE' } } })
        : this.db.$queryRaw<
            { count: number }[]
          >`SELECT COUNT(DISTINCT m."userId")::int AS count FROM "AnalyticsMemberDay" m JOIN "User" u ON u.id=m."userId" WHERE u.status='ACTIVE' AND m.day>=${dayFrom} AND m.day<=${dayTo}`.then(
            (r) => r[0].count,
          ),
      this.db.analyticsMember.count({
        where: { lastSeen: { gte: new Date(Date.now() - 300000) }, user: { status: 'ACTIVE' } },
      }),
      this.db.analyticsDay.findMany({
        where: { day: { gte: dayFrom, lte: dayTo } },
        orderBy: { day: 'asc' },
      }),
      this.db.postView.count({
        where: {
          post: visible,
          user: { status: 'ACTIVE' },
          ...(range.period === 'all'
            ? {}
            : {
                day: {
                  gte: dayFrom.toISOString().slice(0, 10),
                  lte: dayTo.toISOString().slice(0, 10),
                },
              }),
        },
      }),
    ]);
    const seriesStart = range.period === 'all' ? new Date(dayTo.getTime() - 89 * DAY) : dayFrom;
    const registrations = await this.db.$queryRaw<
      { day: string; count: number }[]
    >`SELECT to_char("createdAt"+INTERVAL '1 hour','YYYY-MM-DD') AS day,COUNT(*)::int AS count FROM "User" WHERE status='ACTIVE' AND "createdAt">=${new Date(seriesStart.getTime() - 3600000)} AND "createdAt"<${to} GROUP BY 1`;
    const series = [];
    for (let t = seriesStart.getTime(); t <= dayTo.getTime(); t += DAY) {
      const day = new Date(t).toISOString().slice(0, 10),
        row = days.find((x) => x.day.toISOString().startsWith(day));
      series.push({
        day,
        newMembers: registrations.find((r) => r.day === day)?.count ?? 0,
        pageViews: row?.pageViews ?? 0,
        visitors: row?.visitors ?? 0,
        activeMembers: row?.activeMembers ?? 0,
        measured: t >= nigeriaDay(settings.trackingSince).getTime(),
      });
    }
    return {
      generatedAt: new Date().toISOString(),
      timezone: 'Africa/Lagos',
      trackingSince: settings.trackingSince.toISOString(),
      period: range.period,
      from: from.toISOString(),
      to: to.toISOString(),
      partial: settings.trackingSince > from,
      publicRankingsEnabled: settings.publicRankings,
      metrics: {
        members,
        newMembers,
        posts,
        replies,
        articles,
        likes,
        reposts,
        quotes,
        communities,
        activeMembers:
          range.period === 'all' || dayFrom.getTime() >= nigeriaDay().getTime() - 90 * DAY
            ? active
            : null,
        onlineNow: online,
        pageViews: days.reduce((a, d) => a + d.pageViews, 0),
        visitorDays: days.reduce((a, d) => a + d.visitors, 0),
        postViewDays: postViews,
      },
      series,
    };
  }
  async rankings(viewer?: string, publicOnly = false) {
    const userFilter = {
      AND: [visibleAuthor(viewer, true), ...(publicOnly ? [{ publicRankingsOptOut: false }] : [])],
    };
    const postFilter: Prisma.PostWhereInput = {
      AND: [
        postVisibility(viewer, true),
        ...(publicOnly ? [{ author: { publicRankingsOptOut: false } }] : []),
      ],
    };
    const [followers, liked, discussed, viewed, reposted, communities] = await Promise.all([
      this.db.follow.groupBy({
        by: ['followingId'],
        where: { following: userFilter, follower: visibleAuthor(viewer, true) },
        _count: { followingId: true },
        orderBy: [{ _count: { followingId: 'desc' } }, { followingId: 'asc' }],
        take: 10,
      }),
      this.db.like.groupBy({
        by: ['postId'],
        where: { post: postFilter, user: visibleAuthor(viewer, true) },
        _count: { postId: true },
        orderBy: [{ _count: { postId: 'desc' } }, { postId: 'asc' }],
        take: 10,
      }),
      this.db.post.groupBy({
        by: ['parentId'],
        where: {
          AND: [postVisibility(viewer, true), { parentId: { not: null }, parent: postFilter }],
        },
        _count: { parentId: true },
        orderBy: [{ _count: { parentId: 'desc' } }, { parentId: 'asc' }],
        take: 10,
      }),
      this.db.postView.groupBy({
        by: ['postId'],
        where: { post: postFilter, user: visibleAuthor(viewer, true) },
        _count: { postId: true },
        orderBy: [{ _count: { postId: 'desc' } }, { postId: 'asc' }],
        take: 10,
      }),
      this.db.repost.groupBy({
        by: ['postId'],
        where: { post: postFilter, user: visibleAuthor(viewer, true) },
        _count: { postId: true },
        orderBy: [{ _count: { postId: 'desc' } }, { postId: 'asc' }],
        take: 10,
      }),
      this.db.communityMember.groupBy({
        by: ['communityId'],
        where: { community: { active: true }, user: visibleAuthor(viewer, true) },
        _count: { communityId: true },
        orderBy: [{ _count: { communityId: 'desc' } }, { communityId: 'asc' }],
        take: 10,
      }),
    ]);
    const ids = [
      ...new Set(
        [...liked, ...viewed, ...reposted]
          .map((x) => x.postId)
          .concat(discussed.flatMap((x) => (x.parentId ? [x.parentId] : []))),
      ),
    ];
    const [users, posts, groups] = await Promise.all([
      this.db.user.findMany({
        where: { id: { in: followers.map((x) => x.followingId) } },
        select: { id: true, username: true, displayName: true },
      }),
      this.db.post.findMany({
        where: { AND: [{ id: { in: ids } }, postFilter] },
        select: {
          id: true,
          body: true,
          author: { select: { username: true } },
          article: { select: { slug: true, title: true } },
        },
      }),
      this.db.community.findMany({
        where: { id: { in: communities.map((x) => x.communityId) } },
        select: { id: true, slug: true, name: true },
      }),
    ]);
    const postRows = (rows: { postId: string; _count: { postId: number } }[]) =>
      rows.flatMap((r) => {
        const p = posts.find((p) => p.id === r.postId);
        return p
          ? [
              {
                label: (p.article?.title ?? p.body).slice(0, 140),
                href: p.article ? '/articles/' + p.article.slug : '/posts/' + p.id,
                count: r._count.postId,
              },
            ]
          : [];
      });
    return {
      scope:
        'Current eligible public records, all time; counts can change after removal or moderation.',
      followers: followers.flatMap((r) => {
        const u = users.find((u) => u.id === r.followingId);
        return u
          ? [
              {
                label: u.displayName + ' (@' + u.username + ')',
                href: '/u/' + u.username,
                count: r._count.followingId,
              },
            ]
          : [];
      }),
      likedPosts: postRows(liked),
      discussedPosts: postRows(
        discussed.flatMap((r) =>
          r.parentId ? [{ postId: r.parentId, _count: { postId: r._count.parentId } }] : [],
        ),
      ),
      viewedPosts: postRows(viewed),
      repostedPosts: postRows(reposted),
      communities: communities.flatMap((r) => {
        const c = groups.find((c) => c.id === r.communityId);
        return c
          ? [{ label: c.name, href: '/communities/' + c.slug, count: r._count.communityId }]
          : [];
      }),
    };
  }
  async adminSummary(period = '7d', customRange?: ReturnType<typeof statsRange>) {
    const range = customRange ?? statsRange(period),
      date = { gte: range.from, lt: range.to },
      day = { gte: range.dayFrom, lte: range.dayTo };
    const summary = await this.summary(range);
    const [
      accounts,
      suspended,
      verified,
      sessions,
      allPosts,
      hidden,
      deleted,
      drafts,
      copies,
      scheduled,
      openReports,
      resolved,
      media,
      uploaded,
      bookmarks,
      notifications,
      pages,
      sources,
      activity,
      dbBytes,
      review,
    ] = await Promise.all([
      this.db.user.count(),
      this.db.user.count({ where: { status: 'SUSPENDED' } }),
      this.db.user.count({ where: { emailVerifiedAt: { not: null } } }),
      this.db.session.count({
        where: { expiresAt: { gt: new Date() }, user: { status: 'ACTIVE' } },
      }),
      this.db.post.count({ where: { createdAt: date } }),
      this.db.post.count({ where: { status: 'HIDDEN' } }),
      this.db.post.count({ where: { deletedAt: { not: null } } }),
      this.db.article.count({ where: { status: 'DRAFT' } }),
      this.db.articleWorkingCopy.count(),
      this.db.articleWorkingCopy.count({ where: { scheduledAt: { not: null } } }),
      this.db.report.count({ where: { status: 'OPEN' } }),
      this.db.report.count({ where: { status: 'RESOLVED', reviewedAt: date } }),
      this.db.media.aggregate({ _sum: { bytes: true }, _count: true }),
      this.db.media.aggregate({ where: { createdAt: date }, _sum: { bytes: true }, _count: true }),
      this.db.bookmark.count({ where: { createdAt: date } }),
      this.db.notification.count({ where: { createdAt: date } }),
      this.db.analyticsPageDay.groupBy({
        by: ['page'],
        where: { day },
        _sum: { views: true },
        orderBy: { _sum: { views: 'desc' } },
      }),
      this.db.analyticsSourceDay.groupBy({
        by: ['source'],
        where: { day },
        _sum: { visitors: true },
        orderBy: { _sum: { visitors: 'desc' } },
      }),
      this.db.analyticsDay.aggregate({
        where: { day },
        _sum: { apiRequests: true, apiErrors: true, apiLatencyMs: true, slowRequests: true },
      }),
      this.db.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`
        .then((r) => Number(r[0].bytes))
        .catch(() => null),
      this.db.$queryRaw<
        { hours: number | null }[]
      >`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("reviewedAt"-"createdAt"))/3600) AS hours FROM "Report" WHERE status='RESOLVED' AND "reviewedAt">=${range.from} AND "reviewedAt"<${range.to}`.then(
        (r) => r[0]?.hours ?? null,
      ),
    ]);
    const returned =
      period === 'all'
        ? await this.db.analyticsMember.count({
            where: { daysSeen: { gte: 2 }, user: { status: 'ACTIVE' } },
          })
        : (
            await this.db.$queryRaw<
              { count: number }[]
            >`SELECT COUNT(*)::int AS count FROM (SELECT m."userId" FROM "AnalyticsMemberDay" m JOIN "User" u ON u.id=m."userId" WHERE u.status='ACTIVE' AND m.day>=${range.dayFrom} AND m.day<=${range.dayTo} GROUP BY m."userId" HAVING COUNT(*)>=2) members`
          )[0].count;
    const tracking = await this.settings();
    const cohortFrom = new Date(
      Math.max(range.from.getTime(), tracking.trackingSince.getTime(), Date.now() - 90 * DAY),
    );
    const cohortTo = new Date(Math.min(range.to.getTime(), Date.now() - 14 * DAY));
    const cohort =
      cohortFrom < cohortTo
        ? (
            await this.db.$queryRaw<
              { eligible: number; returned: number }[]
            >`SELECT COUNT(*)::int AS eligible,COUNT(*) FILTER(WHERE EXISTS(SELECT 1 FROM "AnalyticsMemberDay" m WHERE m."userId"=u.id AND m.day>=((u."createdAt"+INTERVAL '1 hour')::date+7) AND m.day<((u."createdAt"+INTERVAL '1 hour')::date+14)))::int AS returned FROM "User" u WHERE u.status='ACTIVE' AND u."createdAt">=${cohortFrom} AND u."createdAt"<${cohortTo}`
          )[0]
        : null;
    const api = activity._sum;
    const requests = api.apiRequests ?? 0;
    const memory = process.memoryUsage();
    return {
      ...summary,
      admin: {
        accounts,
        suspended,
        verified,
        unverified: accounts - verified,
        unexpiredSessions: sessions,
        allPostsCreated: allPosts,
        hiddenPosts: hidden,
        softDeletedPosts: deleted,
        draftArticles: drafts,
        workingCopies: copies,
        scheduledArticles: scheduled,
        openReports,
        resolvedReports: resolved,
        medianReviewHours: review,
        mediaFiles: media._count,
        mediaBytes: media._sum.bytes ?? 0,
        uploadedFiles: uploaded._count,
        uploadedBytes: uploaded._sum.bytes ?? 0,
        mediaCapacityBytes: 512 * 1024 * 1024,
        mediaProvider: process.env.MEDIA_STORAGE_PROVIDER || 'local',
        databaseBytes: dbBytes,
        bookmarks,
        notifications,
        returningMembers: returned,
        cohortMembers: cohort?.eligible ?? null,
        cohortReturned: cohort?.returned ?? null,
        weekTwoReturnRate: cohort?.eligible
          ? Math.round((cohort.returned / cohort.eligible) * 1000) / 10
          : null,
        apiRequests: requests,
        apiErrors: api.apiErrors ?? 0,
        slowRequests: api.slowRequests ?? 0,
        meanResponseMs: requests ? Math.round((api.apiLatencyMs ?? 0) / requests) : null,
        processUptimeSeconds: Math.floor(process.uptime()),
        processRssBytes: memory.rss,
        processHeapBytes: memory.heapUsed,
      },
      pages: pages.map((p) => ({ page: p.page, views: p._sum.views ?? 0 })),
      sources: sources.map((s) => ({ source: s.source, visitors: s._sum.visitors ?? 0 })),
      modules: [
        {
          key: 'payments',
          title: 'Revenue, refunds, fees and net receipts',
          status: 'not_configured',
          message:
            'Payment and promotion billing are not connected. Financial figures are unavailable.',
        },
        {
          key: 'campaigns',
          title: 'Promotion impressions, clicks and conversion',
          status: 'not_configured',
          message: 'Paid placements and conversion tracking are not connected.',
        },
        {
          key: 'commerce',
          title: 'Marketplace, jobs, accommodation and events',
          status: 'not_configured',
          message: 'Listing and ticketing modules are not connected.',
        },
        {
          key: 'retention',
          title: 'Registration cohorts and week-two returns',
          status: cohort ? 'available' : 'waiting_for_data',
          message: cohort
            ? 'Available in Growth. Eligible new members returning on registration days 7–13; a rolling 90-day registration window and currently active accounts are used.'
            : 'Needs mature registrations after measurement started. Check Last 30 days or All time after at least 14 days.',
        },
        {
          key: 'uptime',
          title: 'External uptime and delivery monitoring',
          status: 'not_configured',
          message:
            'API process metrics are available; no independent uptime or email-delivery monitor is connected.',
        },
        {
          key: 'storage',
          title: 'Cloud media and bandwidth billing',
          status: 'not_configured',
          message:
            'Local image storage is measured. CDN bandwidth/provider billing are not connected.',
        },
      ],
    };
  }
  async weekly(weekStart: Date) {
    const existing = await this.db.analyticsWeeklyReport.findUnique({ where: { weekStart } });
    if (existing) return existing;
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY),
      from = new Date(weekStart.getTime() - 3600000),
      to = new Date(weekEnd.getTime() - 3600000);
    const settings = await this.settings();
    if (to.getTime() > Date.now() || to <= settings.trackingSince) return null;
    const publicData = await this.summary({
      period: 'week',
      from,
      to,
      dayFrom: weekStart,
      dayTo: new Date(weekEnd.getTime() - DAY),
    });
    // Store only aggregate private counts; never persist ranking identities/content in snapshots.
    const admin = await this.adminSummary('week', {
      period: 'week',
      from,
      to,
      dayFrom: weekStart,
      dayTo: new Date(weekEnd.getTime() - DAY),
    });
    await this.db.analyticsWeeklyReport.createMany({
      data: [
        {
          weekStart,
          weekEnd,
          partial: settings.trackingSince > from,
          publicData: JSON.parse(
            JSON.stringify({ ...publicData, metrics: { ...publicData.metrics, onlineNow: null } }),
          ),
          adminData: {
            metrics: admin.admin,
            pages: admin.pages,
            sources: admin.sources,
            scope:
              'Period metrics use this week; current inventory/status totals are as observed at capture.',
          },
        },
      ],
      skipDuplicates: true,
    });
    return this.db.analyticsWeeklyReport.findUniqueOrThrow({ where: { weekStart } });
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.flushApi();
      const now = new Date();
      const settings = await this.settings();
      const currentWeek = nigeriaWeek(now);
      let start = nigeriaWeek(settings.trackingSince);
      const latest = await this.db.analyticsWeeklyReport.findFirst({
        orderBy: { weekStart: 'desc' },
      });
      if (latest) start = new Date(latest.weekStart.getTime() + 7 * DAY);
      for (
        let i = 0;
        i < 4 && start < currentWeek;
        i++, start = new Date(start.getTime() + 7 * DAY)
      )
        await this.weekly(start);
      const day = nigeriaDay();
      await this.db.analyticsHit.deleteMany({
        where: { day: { lt: new Date(day.getTime() - 8 * DAY) } },
      });
      await this.db.analyticsVisitorDay.deleteMany({
        where: { day: { lt: new Date(day.getTime() - 31 * DAY) } },
      });
      await this.db.analyticsMemberDay.deleteMany({
        where: { day: { lt: new Date(day.getTime() - 90 * DAY) } },
      });
    } catch {
      this.logger.warn('Analytics housekeeping will retry on the next tick.');
    } finally {
      this.running = false;
    }
  }
  clearCache() {
    this.publicCache.clear();
  }
}
@Controller('stats')
export class StatsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly db: Database,
  ) {}
  @Get() summary(@Query() q: StatsQuery) {
    return this.analytics.publicSummary(q.period);
  }
  @Post('collect')
  @UseGuards(BrowserOriginGuard, OptionalSessionGuard)
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  collect(@Body() dto: TrackDto, @Req() req: AuthRequest) {
    if (
      req.headers.dnt === '1' ||
      req.headers['sec-gpc'] === '1' ||
      /bot|crawler|spider|HeadlessChrome/i.test(req.headers['user-agent'] ?? '')
    )
      return { recorded: false };
    return this.analytics.track(dto, req.account?.id);
  }
  @Get('rankings') @UseGuards(OptionalSessionGuard) async rankings(@Req() req: AuthRequest) {
    if (!(await this.analytics.settings()).publicRankings)
      return { enabled: false, message: 'Public rankings are not enabled yet.' };
    return { enabled: true, ...(await this.analytics.rankings(req.account?.id, true)) };
  }
  @Get('reports') reports(@Query() q: ReportsQuery) {
    return this.db.analyticsWeeklyReport.findMany({
      where: q.before ? { weekStart: { lt: new Date(q.before + 'T00:00:00Z') } } : {},
      orderBy: { weekStart: 'desc' },
      take: 12,
      select: { weekStart: true, weekEnd: true, capturedAt: true, partial: true, publicData: true },
    });
  }
  @Get('preferences') @UseGuards(SessionGuard) async preferences(@Req() req: AuthRequest) {
    const u = await this.db.user.findUniqueOrThrow({
      where: { id: req.account.id },
      select: { publicRankingsOptOut: true },
    });
    return { excludeFromPublicRankings: u.publicRankingsOptOut };
  }
  @Put('preferences') @UseGuards(SessionGuard) async preference(
    @Req() req: AuthRequest,
    @Body() dto: PreferenceDto,
  ) {
    await this.db.user.update({
      where: { id: req.account.id },
      data: { publicRankingsOptOut: dto.excludeFromPublicRankings },
    });
    return dto;
  }
}
@Controller('admin/analytics')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('analytics.view')
export class AdminAnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly db: Database,
  ) {}
  @Get() summary(@Query() q: StatsQuery) {
    return this.analytics.adminSummary(q.period);
  }
  @Get('rankings') rankings() {
    return this.analytics.rankings();
  }
  @Get('reports') reports(@Query() q: ReportsQuery) {
    return this.db.analyticsWeeklyReport.findMany({
      where: q.before ? { weekStart: { lt: new Date(q.before + 'T00:00:00Z') } } : {},
      orderBy: { weekStart: 'desc' },
      take: 12,
    });
  }
  @Get('settings') async settings() {
    const s = await this.analytics.settings();
    return { publicRankings: s.publicRankings, trackingSince: s.trackingSince };
  }
  @Put('settings') @RequirePermission('analytics.manage') async save(
    @Body() dto: SettingsDto,
    @Req() req: AuthRequest,
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.analyticsSettings.update({ where: { key: 'main' }, data: dto });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'analytics.settings',
          targetId: 'main',
          reason: dto.publicRankings ? 'Enabled public rankings' : 'Disabled public rankings',
        },
      });
    });
    this.analytics.clearCache();
    return dto;
  }
}
