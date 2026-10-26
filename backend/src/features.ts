import { lockUsernames, assertUsername, protectOldUsername } from './usernames';
import { Throttle } from '@nestjs/throttler';
import { sessionTracker } from './notification-throttle';
import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
  Post,
} from '@nestjs/common';
import { safetyTransaction } from './safety-transaction';
import { visibleAuthor } from './post-visibility';
import { MediaService } from './media';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import {
  reservedUsername,
  birthDate,
  AuthRequest,
  OptionalSessionGuard,
  publicUser,
  SessionGuard,
} from './auth';
import { PostsService } from './posts';
import { FeedQuery } from './dtos';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsUUID } from 'class-validator';
import { postVisibility } from './post-visibility';
class MetricsQuery {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  ids!: string[];
}
class OnboardingDto {
  @IsIn(['TOPICS', 'PEOPLE', 'DONE']) stage!: string;
}
import { InterestsDto, ProfileDto } from './feature-dtos';
import { VerifiedGuard } from './permissions';
@Controller('social')
export class SocialController {
  constructor(
    private readonly db: Database,
    private readonly posts: PostsService,
  ) {}
  @Get('engagements')
  @UseGuards(OptionalSessionGuard)
  @Throttle({ default: { limit: 30, ttl: 60000, getTracker: sessionTracker } })
  async engagements(@Query() q: MetricsQuery, @Req() req: AuthRequest) {
    const viewer = req.account?.id;
    const nobody = '00000000-0000-0000-0000-000000000000';
    const rows = await this.db.post.findMany({
      where: { AND: [{ id: { in: q.ids } }, postVisibility(viewer)] },
      select: {
        id: true,
        _count: {
          select: {
            likes: true,
            reposts: true,
            bookmarks: true,
            views: true,
            replies: { where: postVisibility(viewer, true) },
            quotes: { where: postVisibility(viewer, true) },
          },
        },
        likes: { where: { userId: viewer ?? nobody }, select: { userId: true }, take: 1 },
        reposts: { where: { userId: viewer ?? nobody }, select: { userId: true }, take: 1 },
        bookmarks: { where: { userId: viewer ?? nobody }, select: { userId: true }, take: 1 },
      },
    });
    return {
      data: rows.map(({ likes, reposts, bookmarks, ...row }) => ({
        ...row,
        viewer: {
          liked: !!likes.length,
          reposted: !!reposts.length,
          bookmarked: !!bookmarks.length,
        },
      })),
    };
  }

  @Put('posts/:id/:kind')
  @UseGuards(SessionGuard, VerifiedGuard)
  async engage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @Req() req: AuthRequest,
  ) {
    await this.posts.get(id, req.account.id);
    const userId = req.account.id;
    const key = { userId_postId: { userId, postId: id } };
    if (kind === 'likes')
      await this.db.like.upsert({ where: key, create: { userId, postId: id }, update: {} });
    else if (kind === 'reposts')
      await this.db.repost.upsert({ where: key, create: { userId, postId: id }, update: {} });
    else if (kind === 'bookmarks')
      await this.db.bookmark.upsert({ where: key, create: { userId, postId: id }, update: {} });
    else throw new BadRequestException('Unknown interaction');
    return this.posts.get(id, userId);
  }
  @Delete('posts/:id/:kind')
  @UseGuards(SessionGuard)
  async disengage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @Req() req: AuthRequest,
  ) {
    const where = { userId: req.account.id, postId: id };
    if (kind === 'likes') await this.db.like.deleteMany({ where });
    else if (kind === 'reposts') await this.db.repost.deleteMany({ where });
    else if (kind === 'bookmarks') await this.db.bookmark.deleteMany({ where });
    else throw new BadRequestException('Unknown interaction');
    return this.posts.get(id, req.account.id);
  }
  @Post('posts/:id/view')
  @UseGuards(SessionGuard)
  async view(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    await this.posts.get(id, req.account.id);
    const day = new Date().toISOString().slice(0, 10);
    await this.db.postView.upsert({
      where: { userId_postId_day: { userId: req.account.id, postId: id, day } },
      create: { userId: req.account.id, postId: id, day },
      update: {},
    });
    return { views: await this.db.postView.count({ where: { postId: id } }) };
  }
  @Get('bookmarks')
  @UseGuards(SessionGuard)
  bookmarks(@Req() req: AuthRequest, @Query() q: FeedQuery) {
    return this.posts.list(q, undefined, undefined, req.account.id, true);
  }
  @Put('users/:id/follow')
  @UseGuards(SessionGuard, VerifiedGuard)
  async follow(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    if (id === req.account.id) throw new BadRequestException('You cannot follow yourself');
    return safetyTransaction(this.db, async (tx) => {
      if (!(await tx.user.findFirst({ where: { AND: [{ id }, visibleAuthor(req.account.id)] } })))
        throw new NotFoundException();
      await tx.follow.upsert({
        where: { followerId_followingId: { followerId: req.account.id, followingId: id } },
        create: { followerId: req.account.id, followingId: id },
        update: {},
      });
      return { ok: true };
    });
  }
  @Delete('users/:id/follow')
  @UseGuards(SessionGuard)
  async unfollow(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    await this.db.follow.deleteMany({ where: { followerId: req.account.id, followingId: id } });
    return { ok: true };
  }
}
@Controller('catalog')
export class CatalogController {
  constructor(private readonly db: Database) {}
  @Get('topics') topics() {
    return this.db.topic.findMany({ orderBy: { name: 'asc' } });
  }
  @Get('communities')
  @UseGuards(OptionalSessionGuard)
  async communities(@Req() req: AuthRequest) {
    const rows = await this.db.community.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: true } },
        members: {
          where: { userId: req.account?.id ?? '00000000-0000-0000-0000-000000000000' },
          take: 1,
          select: { userId: true },
        },
      },
    });
    return rows.map(({ members, ...row }) => ({ ...row, joined: members.length > 0 }));
  }
  @Put('communities/:id/join')
  @UseGuards(SessionGuard, VerifiedGuard)
  async join(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    if (!(await this.db.community.findFirst({ where: { id, active: true } })))
      throw new NotFoundException();
    await this.db.communityMember.upsert({
      where: { userId_communityId: { userId: req.account.id, communityId: id } },
      create: { userId: req.account.id, communityId: id },
      update: {},
    });
    return { ok: true };
  }
  @Delete('communities/:id/join')
  @UseGuards(SessionGuard)
  async leave(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    await this.db.communityMember.deleteMany({
      where: { userId: req.account.id, communityId: id },
    });
    return { ok: true };
  }
}
@Controller('profile')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(
    private readonly db: Database,
    private readonly media: MediaService,
  ) {}
  @Put() async update(@Req() req: AuthRequest, @Body() dto: ProfileDto) {
    if (dto.username && dto.username !== req.account.username && reservedUsername(dto.username))
      throw new BadRequestException('Choose a different username');
    await this.media.assertOwned(dto.avatarMediaId, req.account.id, 'AVATAR');
    await this.media.assertOwned(dto.profileCoverMediaId, req.account.id, 'PROFILE');
    const dateOfBirth = dto.dateOfBirth === undefined ? undefined : birthDate(dto.dateOfBirth);
    try {
      return await this.db.$transaction(async (tx) => {
        await lockUsernames(tx);
        const current = await tx.user.findUniqueOrThrow({ where: { id: req.account.id } });
        if (dto.username && dto.username !== current.username) {
          await assertUsername(tx, dto.username, current.id);
          await protectOldUsername(tx, current.id, current.username);
        }
        const needsReview =
          current.identityStatus === 'VERIFIED' &&
          ((dto.username !== undefined && dto.username !== current.username) ||
            (dto.displayName !== undefined && dto.displayName !== current.displayName) ||
            (dto.avatarMediaId !== undefined && dto.avatarMediaId !== current.avatarMediaId));
        const updated = await tx.user.update({
          where: { id: req.account.id },
          data: {
            ...(needsReview ? { identityStatus: 'REVIEW' } : {}),
            gender: dto.gender,
            occupation: dto.occupation,
            skills: dto.skills,
            profileCoverMediaId: dto.profileCoverMediaId,
            campusIdentity: dto.campusIdentity,
            username: dto.username,
            phoneNumber: dto.phoneNumber,
            ...(dto.phoneNumber !== undefined && dto.phoneNumber !== req.account.phoneNumber
              ? { phoneVerifiedAt: null, discoverByPhone: false }
              : {}),
            dateOfBirth,
            location: dto.location,
            avatarMediaId: dto.avatarMediaId,
            displayName: dto.displayName,
            bio: dto.bio,
            website: dto.website ?? null,
            department: dto.department ?? null,
          },
          select: publicUser,
        });
        if (needsReview) {
          await tx.accountNotice.create({
            data: {
              userId: current.id,
              message:
                'Your identity badge is under review because your name, username or profile picture changed. You can request another review in Settings.',
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: current.id,
              action: 'identity.review',
              targetId: current.id,
              reason: 'Verified profile identity details changed',
            },
          });
        }
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Username is unavailable');
      throw error;
    }
  }
  @Put('onboarding') async onboarding(@Req() req: AuthRequest, @Body() dto: OnboardingDto) {
    await this.db.user.update({
      where: { id: req.account.id },
      data: { onboardingStage: dto.stage },
    });
    return { stage: dto.stage };
  }
  @Put('interests') async interests(@Req() req: AuthRequest, @Body() dto: InterestsDto) {
    if (
      (await this.db.topic.count({ where: { id: { in: dto.topicIds } } })) !== dto.topicIds.length
    )
      throw new BadRequestException('Unknown topic');
    await this.db.$transaction(async (tx) => {
      await tx.userInterest.deleteMany({ where: { userId: req.account.id } });
      await tx.userInterest.createMany({
        data: dto.topicIds.map((topicId) => ({ userId: req.account.id, topicId })),
      });
    });
    return { ok: true };
  }
}
@Controller('navigation')
export class NavigationController {
  constructor(private readonly db: Database) {}
  @Get()
  @UseGuards(OptionalSessionGuard)
  async list(@Req() req: AuthRequest) {
    const menus = await this.db.menu.findMany({
      where: { enabled: true },
      orderBy: [{ position: 'asc' }, { key: 'asc' }],
    });
    return menus.filter(
      (m) =>
        (!m.membersOnly || !!req.account) &&
        (!m.permission || req.permissions?.includes(m.permission)),
    );
  }
}
