import {
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import { AuthRequest, OptionalSessionGuard, SessionGuard, publicUser } from './auth';
import { PermissionGuard, RequirePermission, VerifiedGuard } from './permissions';
import { DisplayQuery } from './discovery';
import { visibleAuthor } from './post-visibility';
@Injectable()
export class SportsAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (!req.permissions?.some((p) => p === 'sports.report' || p === 'sports.manage'))
      throw new ForbiddenException('Sports permission required');
    return true;
  }
}
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const STAGES = [
  'GROUP',
  'LEAGUE',
  'ROUND_OF_16',
  'QUARTER_FINAL',
  'SEMI_FINAL',
  'FINAL',
  'THIRD_PLACE',
] as const;
const statuses = ['SCHEDULED', 'LIVE', 'HALF_TIME', 'FULL_TIME', 'POSTPONED', 'CANCELLED'];
export class CompetitionDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(60) season!: string;
  @Transform(trim) @IsString() @MaxLength(1500) description!: string;
  @IsIn(['GROUP_KNOCKOUT', 'LEAGUE', 'KNOCKOUT']) format!: string;
  @IsBoolean() published!: boolean;
  @IsInt() @Min(0) @Max(10) winPoints!: number;
  @IsInt() @Min(0) @Max(10) drawPoints!: number;
  @IsInt() @Min(0) @Max(10) lossPoints!: number;
  @IsOptional() @IsInt() @Min(0) revision?: number;
}
class TeamDto {
  @IsOptional() @IsUUID() logoMediaId?: string | null;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(20)
  groupName!: string;
}
class FixtureDto {
  @IsOptional() @IsBoolean() featuredSidebar?: boolean;
  @IsOptional() @IsBoolean() featuredFeed?: boolean;
  @IsOptional() @IsBoolean() featuredDesktop?: boolean;
  @IsOptional() @IsBoolean() featuredMobile?: boolean;
  @IsUUID() homeId!: string;
  @IsUUID() awayId!: string;
  @IsIn(STAGES) stage!: string;
  @IsDateString() kickoffAt!: string;
  @Transform(trim) @IsString() @MaxLength(120) venue!: string;
  @IsOptional() @IsUUID() reporterId?: string | null;
  @IsBoolean() featured!: boolean;
  @IsOptional() @IsInt() @Min(0) revision?: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
export class ScoreDto {
  @IsInt() @Min(0) revision!: number;
  @IsIn(statuses) status!: string;
  @IsInt() @Min(0) @Max(99) homeScore!: number;
  @IsInt() @Min(0) @Max(99) awayScore!: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) homePenalties?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(99) awayPenalties?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(150) minute?: number | null;
  @IsBoolean() confirmed!: boolean;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
class PlayerDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(99) shirtNumber?: number | null;
  @IsOptional() @IsString() @MaxLength(30) username?: string | null;
  @IsOptional() @IsUUID() photoMediaId?: string | null;
}
class GoalDto {
  @IsInt() @Min(0) revision!: number;
  @IsUUID() teamId!: string;
  @IsOptional() @IsUUID() playerId?: string | null;
  @IsUUID() requestId!: string;
  @IsInt() @Min(0) @Max(150) minute!: number;
  @IsIn(['GOAL', 'PENALTY', 'OWN_GOAL']) kind!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
class VoidGoalDto {
  @IsInt() @Min(0) revision!: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
class ListQuery {
  @IsOptional() @IsUUID() cursor?: string;
}
class UpdatesQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) before?: number;
}
const teamSelect = { id: true, name: true, groupName: true, logoMediaId: true } as const;
export const matchSelect = {
  id: true,
  competitionId: true,
  homeId: true,
  awayId: true,
  stage: true,
  kickoffAt: true,
  venue: true,
  featured: true,
  featuredSidebar: true,
  featuredFeed: true,
  featuredMobile: true,
  featuredDesktop: true,
  status: true,
  homeScore: true,
  awayScore: true,
  homePenalties: true,
  awayPenalties: true,
  minute: true,
  confirmed: true,
  revision: true,
  lastUpdateAt: true,
  home: { select: teamSelect },
  away: { select: teamSelect },
  competition: { select: { id: true, name: true, season: true, published: true, format: true } },
} as const;
export function validateScore(
  dto: Pick<
    ScoreDto,
    | 'status'
    | 'homeScore'
    | 'awayScore'
    | 'homePenalties'
    | 'awayPenalties'
    | 'minute'
    | 'confirmed'
  >,
  stage: string,
) {
  const hasHome = dto.homePenalties != null,
    hasAway = dto.awayPenalties != null;
  if (dto.confirmed && dto.status !== 'FULL_TIME')
    throw new BadRequestException('Only a full-time result can be confirmed');
  if (
    ['SCHEDULED', 'POSTPONED', 'CANCELLED'].includes(dto.status) &&
    (dto.homeScore !== 0 || dto.awayScore !== 0 || hasHome || hasAway || dto.minute != null)
  )
    throw new BadRequestException(
      'Reset the score and minute when scheduling, postponing or cancelling a match; explain any correction',
    );
  if (hasHome !== hasAway) throw new BadRequestException('Enter both penalty scores or neither');
  if (
    hasHome &&
    (dto.status !== 'FULL_TIME' ||
      dto.homeScore !== dto.awayScore ||
      ['GROUP', 'LEAGUE'].includes(stage) ||
      dto.homePenalties === dto.awayPenalties)
  )
    throw new BadRequestException(
      'Penalty results require a tied full-time knockout match and a shootout winner',
    );
  if (
    dto.status === 'FULL_TIME' &&
    !['GROUP', 'LEAGUE'].includes(stage) &&
    dto.homeScore === dto.awayScore &&
    !hasHome
  )
    throw new BadRequestException('Enter the penalty shootout winner for a drawn knockout result');
}
export type StandingTeam = { id: string; name: string; groupName: string };
export type StandingMatch = {
  stage: string;
  status: string;
  confirmed: boolean;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
};
export function standings(
  teams: StandingTeam[],
  matches: StandingMatch[],
  rules: { winPoints: number; drawPoints: number; lossPoints: number },
) {
  const map = new Map(
    teams.map((t) => [
      t.id,
      {
        ...t,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
        rank: 0,
        tied: false,
      },
    ]),
  );
  for (const m of matches) {
    if (m.status !== 'FULL_TIME' || !m.confirmed || !['GROUP', 'LEAGUE'].includes(m.stage))
      continue;
    const h = map.get(m.homeId),
      a = map.get(m.awayId);
    if (!h || !a) continue;
    for (const [team, scored, conceded] of [
      [h, m.homeScore, m.awayScore],
      [a, m.awayScore, m.homeScore],
    ] as const) {
      team.played++;
      team.gf += scored;
      team.ga += conceded;
      team.gd = team.gf - team.ga;
      if (scored > conceded) {
        team.won++;
        team.points += rules.winPoints;
      } else if (scored === conceded) {
        team.drawn++;
        team.points += rules.drawPoints;
      } else {
        team.lost++;
        team.points += rules.lossPoints;
      }
    }
  }
  const groups = [...new Set(teams.map((t) => t.groupName))].sort();
  return groups.map((group) => {
    const rows = [...map.values()]
      .filter((t) => t.groupName === group)
      .sort(
        (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name),
      );
    for (let i = 0; i < rows.length; i++) {
      const equal = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
        a.points === b.points && a.gd === b.gd && a.gf === b.gf;
      rows[i].rank = i && equal(rows[i], rows[i - 1]) ? rows[i - 1].rank : i + 1;
      rows[i].tied = !!(
        (i > 0 && equal(rows[i], rows[i - 1])) ||
        (i + 1 < rows.length && equal(rows[i], rows[i + 1]))
      );
    }
    return { group: group || 'League table', rows };
  });
}
const snapshot = (m: {
  status: string;
  homeScore: number;
  awayScore: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  minute: number | null;
  confirmed: boolean;
}) => ({
  status: m.status,
  homeScore: m.homeScore,
  awayScore: m.awayScore,
  homePenalties: m.homePenalties,
  awayPenalties: m.awayPenalties,
  minute: m.minute,
  confirmed: m.confirmed,
});
@Injectable()
export class SportsService {
  constructor(private readonly db: Database) {}
  async tx<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2034')
          throw new ConflictException('Another update finished first. Reload before saving.');
        if (e.code === 'P2002')
          throw new ConflictException('That name or update already exists. Reload before saving.');
      }
      throw e;
    }
  }
  private manager(req: AuthRequest) {
    return req.permissions?.includes('sports.manage');
  }
  async competition(id: string, staff = false) {
    const c = await this.db.sportsCompetition.findFirst({
      where: { id, ...(staff ? {} : { published: true }) },
      include: {
        teams: { orderBy: { name: 'asc' } },
        matches: { orderBy: [{ kickoffAt: 'asc' }, { id: 'asc' }], select: matchSelect },
      },
    });
    if (!c) throw new NotFoundException('Competition not found');
    return {
      ...c,
      standings: c.format === 'KNOCKOUT' ? [] : standings(c.teams, c.matches, c),
      rulesLabel:
        'Points, goal difference, goals scored. Exact ties remain shared; organiser resolves qualification.',
    };
  }
  async list(query: ListQuery) {
    const rows = await this.db.sportsCompetition.findMany({
      where: { published: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        season: true,
        description: true,
        format: true,
        _count: { select: { teams: true, matches: true } },
      },
    });
    return { data: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
  }
  async match(id: string, req: AuthRequest) {
    const manager = this.manager(req);
    const m = await this.db.sportsMatch.findFirst({
      where: { id, competition: { published: true } },
      select: { ...matchSelect, reporterId: true },
    });
    if (!m) throw new NotFoundException('Match not found');
    const { reporterId, ...data } = m;
    return {
      ...data,
      canReport:
        !!req.account &&
        (manager || (req.permissions?.includes('sports.report') && reporterId === req.account.id)),
      canManage: !!manager,
    };
  }
  async history(id: string, req: AuthRequest, q: UpdatesQuery) {
    await this.match(id, req);
    const rows = await this.db.sportsUpdate.findMany({
      where: { matchId: id, ...(q.before ? { revision: { lt: q.before } } : {}) },
      orderBy: { revision: 'desc' },
      take: 31,
      select: {
        id: true,
        revision: true,
        kind: true,
        note: true,
        current: true,
        createdAt: true,
        actorId: true,
      },
    });
    const actors = await this.db.user.findMany({
      where: {
        AND: [
          visibleAuthor(req.account?.id, true),
          { id: { in: rows.flatMap((r) => (r.actorId ? [r.actorId] : [])) } },
        ],
      },
      select: { id: true, username: true, displayName: true },
    });
    return {
      data: rows
        .slice(0, 30)
        .map(({ actorId, ...r }) => ({
          ...r,
          current: snapshot(r.current as unknown as Parameters<typeof snapshot>[0]),
          reporter: actors.find((a) => a.id === actorId) ?? null,
        })),
      nextBefore: rows.length > 30 ? rows[29].revision : null,
    };
  }
  async featured(q: DisplayQuery = new DisplayQuery()) {
    const now = Date.now();
    const candidates = await this.db.sportsMatch.findMany({
      where: {
        featured: true,
        [q.placement === 'feed' ? 'featuredFeed' : 'featuredSidebar']: true,
        [q.device === 'mobile' ? 'featuredMobile' : 'featuredDesktop']: true,
        competition: { published: true },
        OR: [
          { status: { in: ['LIVE', 'HALF_TIME'] } },
          {
            status: 'SCHEDULED',
            kickoffAt: { gte: new Date(now - 2 * 3600000), lte: new Date(now + 7 * 86400000) },
          },
          { status: 'FULL_TIME', lastUpdateAt: { gte: new Date(now - 86400000) } },
        ],
      },
      select: matchSelect,
      orderBy: [{ kickoffAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    const priority = (s: string) =>
      ['LIVE', 'HALF_TIME'].includes(s) ? 0 : s === 'SCHEDULED' ? 1 : 2;
    return (
      candidates.sort(
        (a, b) =>
          priority(a.status) - priority(b.status) ||
          Math.abs(+a.kickoffAt - now) - Math.abs(+b.kickoffAt - now),
      )[0] ?? null
    );
  }
  async workbench(req: AuthRequest) {
    if (this.manager(req))
      return this.db.sportsCompetition.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: { id: true, name: true, season: true, published: true, revision: true },
      });
    return this.db.sportsMatch.findMany({
      where: { reporterId: req.account.id, competition: { published: true } },
      orderBy: { kickoffAt: 'desc' },
      take: 100,
      select: matchSelect,
    });
  }
  async saveCompetition(id: string | undefined, dto: CompetitionDto, req: AuthRequest) {
    return this.tx(async (tx) => {
      const old = id ? await tx.sportsCompetition.findUnique({ where: { id } }) : null;
      if (id && !old) throw new NotFoundException();
      if (old) {
        if (dto.revision !== old.revision)
          throw new ConflictException('Competition changed. Reload before saving.');
        if (
          (dto.format !== old.format ||
            dto.winPoints !== old.winPoints ||
            dto.drawPoints !== old.drawPoints ||
            dto.lossPoints !== old.lossPoints) &&
          (await tx.sportsMatch.count({
            where: { competitionId: id, lastUpdateAt: { not: null } },
          }))
        )
          throw new BadRequestException('Format and points are locked once matches start');
        if (
          dto.format !== old.format &&
          (await tx.sportsMatch.count({ where: { competitionId: id } }))
        )
          throw new BadRequestException('Choose the format before adding fixtures');
      }
      const { revision, ...values } = dto;
      const result = old
        ? await tx.sportsCompetition.update({
            where: { id: old.id },
            data: { ...values, revision: { increment: 1 } },
          })
        : await tx.sportsCompetition.create({ data: values });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'sports.competition.save',
          targetId: result.id,
          reason: dto.published ? 'Competition published/updated' : 'Competition saved privately',
        },
      });
      return result;
    });
  }
  async team(competitionId: string, id: string | undefined, dto: TeamDto, req: AuthRequest) {
    return this.tx(async (tx) => {
      const c = await tx.sportsCompetition.findUnique({ where: { id: competitionId } });
      if (!c) throw new NotFoundException();
      if (c.format === 'GROUP_KNOCKOUT' && !dto.groupName)
        throw new BadRequestException('Give each team a group before creating group fixtures');
      if (c.format !== 'GROUP_KNOCKOUT' && dto.groupName)
        throw new BadRequestException('Group names apply only to group-and-knockout competitions');
      if (
        await tx.sportsTeam.findFirst({
          where: {
            competitionId,
            name: { equals: dto.name, mode: 'insensitive' },
            ...(id ? { id: { not: id } } : {}),
          },
        })
      )
        throw new ConflictException('A team with that name already exists in this competition');
      const old = id ? await tx.sportsTeam.findFirst({ where: { id, competitionId } }) : null;
      if (id && !old) throw new NotFoundException();
      if (
        old &&
        old.groupName !== dto.groupName &&
        (await tx.sportsMatch.count({ where: { OR: [{ homeId: id }, { awayId: id }] } }))
      )
        throw new BadRequestException('A team’s group is locked once it has a fixture');
      if (!id && (await tx.sportsTeam.count({ where: { competitionId } })) >= 64)
        throw new BadRequestException('Use at most 64 teams per competition');
      if (dto.logoMediaId && dto.logoMediaId !== old?.logoMediaId)
        if (
          !(await tx.media.findFirst({
            where: { id: dto.logoMediaId, ownerId: req.account.id, kind: 'SPORT' },
          }))
        )
          throw new BadRequestException('Choose a sports image uploaded by you');
      const team = old
        ? await tx.sportsTeam.update({ where: { id }, data: dto })
        : await tx.sportsTeam.create({ data: { competitionId, ...dto } });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'sports.team.save',
          targetId: team.id,
          reason: 'Team details updated',
        },
      });
      return team;
    });
  }
  async players(teamId: string, viewer?: string, staff = false) {
    if (
      !(await this.db.sportsTeam.findFirst({
        where: { id: teamId, ...(staff ? {} : { competition: { published: true } }) },
      }))
    )
      throw new NotFoundException('Team not found');
    const rows = await this.db.sportsPlayer.findMany({
      where: { teamId },
      orderBy: [{ shirtNumber: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        name: true,
        shirtNumber: true,
        photoMediaId: true,
        user: { where: visibleAuthor(viewer, true), select: publicUser },
      },
    });
    return rows;
  }
  async player(teamId: string, id: string | undefined, dto: PlayerDto, req: AuthRequest) {
    return this.tx(async (tx) => {
      if (!(await tx.sportsTeam.findUnique({ where: { id: teamId } })))
        throw new NotFoundException('Team not found');
      const old = id ? await tx.sportsPlayer.findFirst({ where: { id, teamId } }) : null;
      if (id && !old) throw new NotFoundException('Player not found');
      if (!old && (await tx.sportsPlayer.count({ where: { teamId } })) >= 100)
        throw new BadRequestException('Use at most 100 players per team');
      const username = dto.username?.trim().toLowerCase();
      const user = username
        ? await tx.user.findFirst({
            where: { AND: [visibleAuthor(req.account.id), { username }] },
            select: { id: true },
          })
        : null;
      if (username && !user)
        throw new BadRequestException(
          'Choose an available public username or leave the account link empty',
        );
      if (dto.photoMediaId && dto.photoMediaId !== old?.photoMediaId)
        if (
          !(await tx.media.findFirst({
            where: { id: dto.photoMediaId, ownerId: req.account.id, kind: 'SPORT' },
          }))
        )
          throw new BadRequestException('Choose a sports image uploaded by you');
      const data = {
        name: dto.name,
        shirtNumber: dto.shirtNumber ?? null,
        userId: user?.id ?? null,
        photoMediaId: dto.photoMediaId ?? null,
      };
      const result = old
        ? await tx.sportsPlayer.update({ where: { id: old.id }, data })
        : await tx.sportsPlayer.create({ data: { ...data, teamId } });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'sports.player.save',
          targetId: result.id,
          reason: 'Sports roster identity updated',
        },
      });
      return { id: result.id };
    });
  }
  async goals(id: string, req: AuthRequest) {
    await this.match(id, req);
    return this.db.sportsGoal.findMany({
      where: { matchId: id, voided: false },
      orderBy: [{ minute: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
      select: {
        id: true,
        teamId: true,
        scorerName: true,
        minute: true,
        kind: true,
        note: true,
        player: {
          select: {
            photoMediaId: true,
            user: { where: visibleAuthor(req.account?.id, true), select: publicUser },
          },
        },
      },
    });
  }
  private goalPermission(
    old: { reporterId: string | null; confirmed: boolean; competition: { published: boolean } },
    req: AuthRequest,
  ) {
    if (!old.competition.published) throw new BadRequestException('Publish this competition first');
    if (!this.manager(req) && old.reporterId !== req.account.id)
      throw new ForbiddenException('Only the assigned scorekeeper can log goals');
    if (old.confirmed && !this.manager(req))
      throw new ForbiddenException('An organiser must correct a confirmed result');
  }
  async goal(id: string, dto: GoalDto, req: AuthRequest) {
    return this.tx(async (tx) => {
      const old = await tx.sportsMatch.findUnique({
        where: { id },
        include: { competition: { select: { published: true } } },
      });
      if (!old) throw new NotFoundException();
      this.goalPermission(old, req);
      const existing = await tx.sportsGoal.findUnique({
        where: { matchId_requestId: { matchId: id, requestId: dto.requestId } },
      });
      if (existing) {
        if (
          existing.teamId !== dto.teamId ||
          existing.playerId !== (dto.playerId ?? null) ||
          existing.minute !== dto.minute ||
          existing.kind !== dto.kind ||
          existing.note !== dto.note
        )
          throw new ConflictException('This request already recorded a different goal');
        return { id: existing.id, revision: old.revision };
      }
      if (old.revision !== dto.revision)
        throw new ConflictException('A newer match update exists. Reload first');
      if (!['LIVE', 'HALF_TIME', 'FULL_TIME'].includes(old.status))
        throw new BadRequestException('Start this match before logging goals');
      if (![old.homeId, old.awayId].includes(dto.teamId))
        throw new BadRequestException('Choose a team playing this match');
      const player = dto.playerId
        ? await tx.sportsPlayer.findUnique({ where: { id: dto.playerId } })
        : null;
      const scorerTeam =
        dto.kind === 'OWN_GOAL'
          ? dto.teamId === old.homeId
            ? old.awayId
            : old.homeId
          : dto.teamId;
      if (dto.playerId && (!player || player.teamId !== scorerTeam))
        throw new BadRequestException('The scorer must belong to the correct team in this match');
      if ((await tx.sportsGoal.count({ where: { matchId: id } })) >= 200)
        throw new BadRequestException('Goal log limit reached');
      const result = await tx.sportsGoal.create({
        data: {
          matchId: id,
          teamId: dto.teamId,
          playerId: dto.playerId ?? null,
          scorerName: player?.name ?? null,
          minute: dto.minute,
          kind: dto.kind,
          note: dto.note,
          requestId: dto.requestId,
        },
      });
      await tx.sportsMatch.update({ where: { id }, data: { revision: { increment: 1 } } });
      await tx.sportsUpdate.create({
        data: {
          matchId: id,
          actorId: req.account.id,
          revision: old.revision + 1,
          kind: 'GOAL',
          note: dto.note,
          previous: snapshot(old),
          current: snapshot(old),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'sports.goal.record',
          targetId: result.id,
          reason: dto.note,
        },
      });
      return { id: result.id, revision: old.revision + 1 };
    });
  }
  async voidGoal(id: string, goalId: string, dto: VoidGoalDto, req: AuthRequest) {
    return this.tx(async (tx) => {
      const old = await tx.sportsMatch.findUnique({
        where: { id },
        include: { competition: { select: { published: true } } },
      });
      if (!old) throw new NotFoundException();
      this.goalPermission(old, req);
      if (old.revision !== dto.revision)
        throw new ConflictException('A newer match update exists. Reload first');
      const goal = await tx.sportsGoal.findFirst({ where: { id: goalId, matchId: id } });
      if (!goal) throw new NotFoundException();
      if (goal.voided) return { ok: true };
      await tx.sportsGoal.update({ where: { id: goalId }, data: { voided: true } });
      await tx.sportsMatch.update({ where: { id }, data: { revision: { increment: 1 } } });
      await tx.sportsUpdate.create({
        data: {
          matchId: id,
          actorId: req.account.id,
          revision: old.revision + 1,
          kind: 'CORRECTION',
          note: dto.note,
          previous: snapshot(old),
          current: snapshot(old),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'sports.goal.void',
          targetId: goalId,
          reason: dto.note,
        },
      });
      return { ok: true };
    });
  }
  private async reporter(tx: Prisma.TransactionClient, id?: string | null) {
    if (
      id &&
      !(await tx.user.findFirst({
        where: {
          id,
          status: 'ACTIVE',
          roles: {
            some: {
              role: {
                OR: [
                  { permissions: { has: 'sports.report' } },
                  { permissions: { has: 'sports.manage' } },
                ],
              },
            },
          },
        },
      }))
    )
      throw new BadRequestException(
        'Assign an active account with sports.report or sports.manage permission',
      );
  }
  async fixture(competitionId: string, id: string | undefined, dto: FixtureDto, req: AuthRequest) {
    return this.tx(async (tx) => {
      const c = await tx.sportsCompetition.findUnique({ where: { id: competitionId } });
      if (!c) throw new NotFoundException();
      const old = id ? await tx.sportsMatch.findFirst({ where: { id, competitionId } }) : null;
      if (id && !old) throw new NotFoundException();
      if (old && dto.revision !== old.revision)
        throw new ConflictException('Fixture changed. Reload before saving.');
      if (!old && (await tx.sportsMatch.count({ where: { competitionId } })) >= 500)
        throw new BadRequestException('Use at most 500 fixtures per competition');
      const teams = await tx.sportsTeam.findMany({
        where: { competitionId, id: { in: [dto.homeId, dto.awayId] } },
      });
      if (teams.length !== 2)
        throw new BadRequestException('Choose two different teams from this competition');
      if (
        (c.format === 'LEAGUE' && dto.stage !== 'LEAGUE') ||
        (c.format === 'KNOCKOUT' && ['GROUP', 'LEAGUE'].includes(dto.stage)) ||
        (c.format === 'GROUP_KNOCKOUT' && dto.stage === 'LEAGUE')
      )
        throw new BadRequestException('Stage does not match the competition format');
      if (
        dto.stage === 'GROUP' &&
        (!teams[0].groupName || teams[0].groupName !== teams[1].groupName)
      )
        throw new BadRequestException('Group fixtures require teams in the same group');
      if (
        old &&
        !['SCHEDULED', 'POSTPONED', 'CANCELLED'].includes(old.status) &&
        (old.homeId !== dto.homeId ||
          old.awayId !== dto.awayId ||
          old.stage !== dto.stage ||
          +old.kickoffAt !== +new Date(dto.kickoffAt))
      )
        throw new BadRequestException('Teams, stage and kickoff are locked after play starts');
      await this.reporter(tx, dto.reporterId);
      const { note, revision, ...values } = dto;
      const data = {
        ...values,
        reporterId: dto.reporterId ?? null,
        kickoffAt: new Date(dto.kickoffAt),
      };
      const result = old
        ? await tx.sportsMatch.update({
            where: { id },
            data: { ...data, revision: { increment: 1 } },
          })
        : await tx.sportsMatch.create({ data: { ...data, competitionId, revision: 1 } });
      await tx.sportsUpdate.create({
        data: {
          matchId: result.id,
          actorId: req.account.id,
          revision: result.revision,
          kind: 'FIXTURE',
          note,
          previous: old
            ? {
                homeId: old.homeId,
                awayId: old.awayId,
                stage: old.stage,
                kickoffAt: old.kickoffAt.toISOString(),
                venue: old.venue,
                reporterId: old.reporterId,
                featured: old.featured,
              }
            : {},
          current: {
            ...snapshot(result),
            homeId: result.homeId,
            awayId: result.awayId,
            stage: result.stage,
            kickoffAt: result.kickoffAt.toISOString(),
            venue: result.venue,
            reporterId: result.reporterId,
            featured: result.featured,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'sports.fixture.save',
          targetId: result.id,
          reason: note,
        },
      });
      return result;
    });
  }
  async update(id: string, dto: ScoreDto, req: AuthRequest) {
    const manager = this.manager(req);
    return this.tx(async (tx) => {
      const old = await tx.sportsMatch.findUnique({
        where: { id },
        include: { competition: { select: { published: true } } },
      });
      if (!old) throw new NotFoundException();
      if (!old.competition.published)
        throw new BadRequestException('Publish the competition before reporting scores');
      if (!manager && old.reporterId !== req.account.id)
        throw new ForbiddenException('Only the assigned scorekeeper can update this match');
      if (!manager && old.confirmed)
        throw new ForbiddenException('An organiser must correct a confirmed result');
      if (!manager && (dto.confirmed || !['LIVE', 'HALF_TIME', 'FULL_TIME'].includes(dto.status)))
        throw new ForbiddenException(
          'Only an organiser can confirm, postpone, cancel or reset a result',
        );
      if (dto.revision !== old.revision)
        throw new ConflictException('A newer score exists. Reload before saving.');
      validateScore(dto, old.stage);
      const data = {
        status: dto.status,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        homePenalties: dto.homePenalties ?? null,
        awayPenalties: dto.awayPenalties ?? null,
        minute: dto.minute ?? null,
        confirmed: dto.confirmed,
      };
      const count = await tx.sportsMatch.updateMany({
        where: { id, revision: dto.revision },
        data: { ...data, revision: { increment: 1 }, lastUpdateAt: new Date() },
      });
      if (count.count !== 1)
        throw new ConflictException('A newer score exists. Reload before saving.');
      await tx.sportsUpdate.create({
        data: {
          matchId: id,
          actorId: req.account.id,
          revision: old.revision + 1,
          kind: old.confirmed ? 'CORRECTION' : dto.confirmed ? 'CONFIRMATION' : 'SCORE',
          note: dto.note,
          previous: snapshot(old),
          current: data,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'sports.score.update',
          targetId: id,
          reason: dto.note,
        },
      });
      return { ok: true, revision: old.revision + 1 };
    });
  }
}
@Controller('sports')
export class SportsController {
  constructor(private readonly sports: SportsService) {}
  @Get() list(@Query() q: ListQuery) {
    return this.sports.list(q);
  }
  @Get('featured') featured(@Query() q: DisplayQuery) {
    return this.sports.featured(q);
  }
  @Get('teams/:id/players') @UseGuards(OptionalSessionGuard) players(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.sports.players(id, req.account?.id);
  }
  @Get('matches/:id/goals') @UseGuards(OptionalSessionGuard) goals(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.sports.goals(id, req);
  }
  @Post('matches/:id/goals') @UseGuards(SessionGuard, SportsAccessGuard, VerifiedGuard) goal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GoalDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.goal(id, dto, req);
  }
  @Put('matches/:id/goals/:goalId/void')
  @UseGuards(SessionGuard, SportsAccessGuard, VerifiedGuard)
  voidGoal(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: VoidGoalDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.voidGoal(id, goalId, dto, req);
  }
  @Get('competitions/:id') competition(@Param('id', ParseUUIDPipe) id: string) {
    return this.sports.competition(id);
  }
  @Get('matches/:id') @UseGuards(OptionalSessionGuard) match(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.sports.match(id, req);
  }
  @Get('matches/:id/updates') @UseGuards(OptionalSessionGuard) history(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Query() q: UpdatesQuery,
  ) {
    return this.sports.history(id, req, q);
  }
  @Put('matches/:id/score') @UseGuards(SessionGuard, SportsAccessGuard, VerifiedGuard) update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScoreDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.update(id, dto, req);
  }
}
@Controller('sports-desk')
@UseGuards(SessionGuard, SportsAccessGuard, PermissionGuard)
export class SportsDeskController {
  constructor(
    private readonly db: Database,
    private readonly sports: SportsService,
  ) {}
  @Get() workbench(@Req() req: AuthRequest) {
    return this.sports.workbench(req);
  }
  @Get('competitions/:id') @RequirePermission('sports.manage') competition(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sports.competition(id, true);
  }
  @Get('teams/:id/players') @RequirePermission('sports.manage') players(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.sports.players(id, req.account.id, true);
  }
  @Post('teams/:id/players') @RequirePermission('sports.manage') player(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlayerDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.player(id, undefined, dto, req);
  }
  @Put('teams/:id/players/:playerId') @RequirePermission('sports.manage') editPlayer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Body() dto: PlayerDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.player(id, playerId, dto, req);
  }
  @Get('reporters') @RequirePermission('sports.manage') reporters() {
    return this.db.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              OR: [
                { permissions: { has: 'sports.report' } },
                { permissions: { has: 'sports.manage' } },
              ],
            },
          },
        },
      },
      take: 100,
      orderBy: { username: 'asc' },
      select: publicUser,
    });
  }
  @Get('competitions/:id/assignments') @RequirePermission('sports.manage') assignments(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.db.sportsMatch.findMany({
      where: { competitionId: id },
      select: { id: true, reporterId: true },
    });
  }
  @Post('competitions') @RequirePermission('sports.manage') create(
    @Body() dto: CompetitionDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.saveCompetition(undefined, dto, req);
  }
  @Put('competitions/:id') @RequirePermission('sports.manage') save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompetitionDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.saveCompetition(id, dto, req);
  }
  @Post('competitions/:id/teams') @RequirePermission('sports.manage') team(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TeamDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.team(id, undefined, dto, req);
  }
  @Put('competitions/:id/teams/:teamId') @RequirePermission('sports.manage') editTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: TeamDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.team(id, teamId, dto, req);
  }
  @Post('competitions/:id/matches') @RequirePermission('sports.manage') fixture(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FixtureDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.fixture(id, undefined, dto, req);
  }
  @Put('competitions/:id/matches/:matchId') @RequirePermission('sports.manage') editFixture(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: FixtureDto,
    @Req() req: AuthRequest,
  ) {
    return this.sports.fixture(id, matchId, dto, req);
  }
}
