import { detectedLinks } from './links';
import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { Database } from './database';
import { AuthRequest, OptionalSessionGuard, SessionGuard } from './auth';
import { postVisibility, visibleAuthor } from './post-visibility';
export type ParsedEntity = {
  start: number;
  end: number;
  label: string;
  username?: string;
  hashtag?: string;
};
export function normalizeHashtag(value: string) {
  const tag = value.normalize('NFKC').toLowerCase();
  if (!/^[\p{L}\p{M}\p{N}_]{1,64}$/u.test(tag) || tag.length > 64)
    throw new BadRequestException('Use a hashtag of 1–64 letters, numbers or underscores');
  return tag;
}
export function parseEntities(body: string): ParsedEntity[] {
  const urls = detectedLinks(body).map((m) => [m.start, m.end]);
  const emails = [...body.matchAll(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9][a-z0-9.-]*/gi)].map(
    (m) => [m.index!, m.index! + m[0].length],
  );
  const entities: ParsedEntity[] = [];
  for (const m of body.matchAll(/(?<![\p{L}\p{M}\p{N}_@#/.])([@#])([\p{L}\p{M}\p{N}_]+)/gu)) {
    const start = m.index!,
      end = start + m[0].length;
    if ([...urls, ...emails].some(([a, b]) => start >= a && start < b)) continue;
    if (m[1] === '@') {
      if (!/^[a-z0-9_]{3,30}$/i.test(m[2])) continue;
      entities.push({ start, end, label: m[0], username: m[2].toLowerCase() });
    } else {
      if (m[2].length > 64) continue;
      entities.push({ start, end, label: m[0], hashtag: normalizeHashtag(m[2]) });
    }
  }
  if (
    entities.length > 30 ||
    new Set(entities.filter((x) => x.username).map((x) => x.username)).size > 10 ||
    new Set(entities.filter((x) => x.hashtag).map((x) => x.hashtag)).size > 10
  )
    throw new BadRequestException(
      'Use at most 10 mentioned accounts, 10 hashtags and 30 total occurrences per post',
    );
  return entities;
}
export async function resolveEntities(tx: Prisma.TransactionClient, body: string, actor: string) {
  const parsed = parseEntities(body);
  const names = [...new Set(parsed.flatMap((e) => (e.username ? [e.username] : [])))];
  const users = names.length
    ? await tx.user.findMany({
        where: { AND: [visibleAuthor(actor), { username: { in: names } }] },
        select: { id: true, username: true },
      })
    : [];
  return parsed.flatMap<Prisma.PostTokenUncheckedCreateWithoutPostInput>((e) => {
    const { username, ...rest } = e;
    if (!username) return [{ ...rest, kind: 'HASHTAG', userId: null }];
    const user = users.find((u) => u.username === username);
    return user ? [{ ...rest, kind: 'MENTION', hashtag: null, userId: user.id }] : [];
  });
}
export function entitySelect(viewer?: string) {
  return {
    start: true,
    end: true,
    label: true,
    kind: true,
    hashtag: true,
    user: { where: visibleAuthor(viewer), select: { id: true, username: true } },
  } as const;
}
class MentionQuery {
  @IsString() @Matches(/^[a-z0-9_]{1,30}$/i) q!: string;
}
class TagQuery {
  @IsOptional() @IsString() @MaxLength(64) q?: string;
}
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly db: Database) {}
  @Get('mentions') @UseGuards(SessionGuard) mentions(
    @Query() q: MentionQuery,
    @Req() req: AuthRequest,
  ) {
    return this.db.user.findMany({
      where: {
        AND: [visibleAuthor(req.account.id, true), { username: { startsWith: q.q.toLowerCase() } }],
      },
      orderBy: { username: 'asc' },
      take: 8,
      select: { id: true, username: true, displayName: true, avatarMediaId: true },
    });
  }
  @Get('hashtags') @UseGuards(OptionalSessionGuard) async hashtags(
    @Query() q: TagQuery,
    @Req() req: AuthRequest,
  ) {
    const prefix = q.q ? normalizeHashtag(q.q) : '';
    const rows = await this.db.postToken.groupBy({
      by: ['hashtag'],
      where: {
        kind: 'HASHTAG',
        hashtag: { not: null, startsWith: prefix },
        post: postVisibility(req.account?.id, true),
      },
      orderBy: { hashtag: 'asc' },
      take: 10,
    });
    return rows.map((x) => ({ tag: x.hashtag! }));
  }
}
