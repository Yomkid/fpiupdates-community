import { sendAccountEmail } from './mail-template';
import { lockUsernames, assertUsername } from './usernames';
import { RecoveryService } from './mail-tokens';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { createHash } from 'node:crypto';
import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  Equals,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import {
  AuthRequest,
  AuthService,
  BrowserOriginGuard,
  cookieOptions,
  OptionalSessionGuard,
  publicUser,
  reservedUsername,
  SESSION_COOKIE,
  SessionGuard,
} from './auth';
import { loadConfig } from './config';
import { hashPassword, newToken, tokenHash, verifyPassword } from './security';
export function localNext(raw: unknown) {
  if (
    typeof raw !== 'string' ||
    raw.length > 500 ||
    !raw.startsWith('/') ||
    /[\\\u0000-\u001f]/.test(raw) ||
    raw.startsWith('//')
  )
    return '/home';
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f]/.test(decoded)) return '/home';
    const u = new URL(raw, 'https://fpi.invalid');
    if (
      u.origin !== 'https://fpi.invalid' ||
      /^\/(?:login|register|auth\/google)(?:\/|$)/.test(u.pathname)
    )
      return '/home';
    return u.pathname === '/' ? '/home' : u.pathname + u.search + u.hash;
  } catch {
    return '/home';
  }
}
export function googleSettings() {
  const clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const u = new URL(redirectUri);
    if (
      u.pathname !== '/api/v1/auth/google/callback' ||
      u.search ||
      u.hash ||
      u.username ||
      u.password ||
      (u.protocol !== 'https:' &&
        !(
          process.env.NODE_ENV !== 'production' &&
          u.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(u.hostname)
        ))
    )
      return null;
    return { clientId, clientSecret, redirectUri };
  } catch {
    return null;
  }
}
const challengeCookie = 'fpi_google_state',
  enrollCookie = 'fpi_google_enroll';
const options = () => ({ ...cookieOptions(), path: '/api/v1/auth/google', maxAge: 10 * 60000 });
function cookie(req: Request, name: string) {
  return (
    req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(name + '='))
      ?.slice(name.length + 1) ?? ''
  );
}
class LinkDto {
  @IsString() @MaxLength(128) password!: string;
}
class CompleteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9_]{3,30}$/)
  username!: string;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  topicIds?: string[];
  @IsBoolean() @Equals(true) agreed!: boolean;
}
export type GoogleIdentity = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  nonce?: string;
  hd?: string;
};
@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
    private readonly recovery: RecoveryService,
  ) {}
  client() {
    const c = googleSettings();
    if (!c) throw new ServiceUnavailableException('Google sign-in is not configured');
    return new OAuth2Client({
      clientId: c.clientId,
      clientSecret: c.clientSecret,
      redirectUri: c.redirectUri,
      transporterOptions: { timeout: 10000 },
    });
  }
  async start(next: unknown, link?: { userId: string; sessionId: string }) {
    const client = this.client();
    await this.db.oAuthChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.db.oAuthEnrollment.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const state = newToken(),
      verifier = newToken() + newToken(),
      nonce = newToken();
    await this.db.oAuthChallenge.create({
      data: {
        stateHash: tokenHash(state),
        verifier,
        nonce,
        next: localNext(next),
        linkUserId: link?.userId,
        linkSessionId: link?.sessionId,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return {
      state,
      url: client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'],
        state,
        nonce,
        prompt: 'select_account',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: CodeChallengeMethod.S256,
      }),
    };
  }
  async exchange(code: string, verifier: string) {
    const client = this.client();
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    if (!tokens.id_token) throw new UnauthorizedException();
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: googleSettings()!.clientId,
    });
    return ticket.getPayload() as GoogleIdentity | undefined;
  }
  async finish(req: AuthRequest, code: string, state: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || cookie(req, challengeCookie) !== state)
      throw new UnauthorizedException('Invalid Google sign-in state');
    const challenge = await this.db.oAuthChallenge.findUnique({
      where: { stateHash: tokenHash(state) },
    });
    if (!challenge || challenge.expiresAt <= new Date()) throw new UnauthorizedException();
    const claimed = await this.db.oAuthChallenge.deleteMany({
      where: { id: challenge.id, expiresAt: { gt: new Date() } },
    });
    if (claimed.count !== 1) throw new UnauthorizedException();
    const identity = await this.exchange(code, challenge.verifier);
    if (
      !identity ||
      identity.nonce !== challenge.nonce ||
      !identity.sub ||
      identity.sub.length > 255 ||
      !identity.email_verified ||
      !identity.email ||
      identity.email.length > 254
    )
      throw new UnauthorizedException('Google identity could not be verified');
    const email = identity.email.toLowerCase();
    const linked = await this.db.oAuthIdentity.findUnique({
      where: { provider_subject: { provider: 'google', subject: identity.sub } },
      include: { user: true },
    });
    if (challenge.linkUserId) {
      if (req.account?.id !== challenge.linkUserId || req.sessionId !== challenge.linkSessionId)
        throw new ForbiddenException('Sign in again to link this account');
      if (linked && linked.userId !== req.account.id)
        throw new ConflictException('This Google account is already linked');
      await this.db.oAuthIdentity
        .create({ data: { provider: 'google', subject: identity.sub, userId: req.account.id } })
        .catch((e) => {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
        });
      const actual = await this.db.oAuthIdentity.findUnique({
        where: { provider_subject: { provider: 'google', subject: identity.sub } },
      });
      if (actual?.userId !== req.account.id) throw new ConflictException();
      return { next: '/settings?google=linked' };
    }
    if (linked) {
      if (linked.user.status !== 'ACTIVE') throw new UnauthorizedException();
      return { next: challenge.next, session: await this.auth.issue(linked.user) };
    }
    if (await this.db.user.findUnique({ where: { email } }))
      return { next: '/login?google=existing' };
    const token = newToken();
    await this.db.oAuthEnrollment.create({
      data: {
        tokenHash: tokenHash(token),
        subject: identity.sub,
        email,
        trustedEmail: email.endsWith('@gmail.com') || !!identity.hd,
        displayName:
          (identity.name ?? 'Community member').trim().slice(0, 80) || 'Community member',
        next: challenge.next,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { next: '/auth/google/setup', enrollment: token };
  }
  async pending(req: Request) {
    const token = cookie(req, enrollCookie);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException('Start Google sign-in again');
    const row = await this.db.oAuthEnrollment.findUnique({
      where: { tokenHash: tokenHash(token) },
    });
    if (!row || row.expiresAt <= new Date())
      throw new UnauthorizedException('Google registration expired');
    return row;
  }
  async complete(req: Request, dto: CompleteDto) {
    const enrollment = await this.pending(req);
    if (reservedUsername(dto.username)) throw new BadRequestException('Choose another username');
    if (
      dto.topicIds?.length &&
      (await this.db.topic.count({ where: { id: { in: dto.topicIds } } })) !== dto.topicIds.length
    )
      throw new BadRequestException('Unknown interest');
    const passwordHash = await hashPassword(newToken());
    try {
      const user = await this.db.$transaction(async (tx) => {
        await lockUsernames(tx);
        await assertUsername(tx, dto.username);
        const claimed = await tx.oAuthEnrollment.deleteMany({
          where: { id: enrollment.id, expiresAt: { gt: new Date() } },
        });
        if (claimed.count !== 1) throw new UnauthorizedException();
        return tx.user.create({
          data: {
            email: enrollment.email,
            username: dto.username,
            displayName: dto.displayName,
            passwordHash,
            onboardingStage: dto.topicIds?.length ? 'PEOPLE' : 'TOPICS',
            passwordEnabled: false,
            emailVerifiedAt: enrollment.trustedEmail ? new Date() : null,
            roles: { create: { role: { connect: { key: 'member' } } } },
            interests: { create: (dto.topicIds ?? []).map((topicId) => ({ topicId })) },
            oauthIdentities: { create: { provider: 'google', subject: enrollment.subject } },
          },
          select: publicUser,
        });
      });
      if (!enrollment.trustedEmail)
        try {
          await this.recovery.send(user.id, 'VERIFY');
        } catch {
          console.warn('Verification delivery unavailable; Google member can resend.');
        }
      if (enrollment.trustedEmail)
        await sendAccountEmail(
          this.db,
          user.id,
          'Welcome to FpiUpdates',
          'Your Google account is connected. Join conversations and complete your profile whenever you are ready.',
          '/home',
        );
      return { user, next: enrollment.next, session: await this.auth.issue(user) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException(
          'Email, Google account or username is unavailable. Sign in to an existing account to link Google.',
        );
      throw e;
    }
  }
}
@Controller('auth')
export class GoogleAuthController {
  constructor(
    private readonly google: GoogleAuthService,
    private readonly db: Database,
  ) {}
  @Get('providers') providers() {
    return { google: !!googleSettings() };
  }
  @Get('google/start') @Throttle({ default: { limit: 15, ttl: 60000 } }) async start(
    @Query('next') next: unknown,
    @Res() res: Response,
  ) {
    const result = await this.google.start(next);
    res.cookie(challengeCookie, result.state, options());
    res.redirect(result.url);
  }
  @Get('google/callback') @UseGuards(OptionalSessionGuard) async callback(
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    try {
      if (typeof code !== 'string' || code.length > 4096 || typeof state !== 'string')
        throw new BadRequestException();
      const result = await this.google.finish(req, code, state);
      if (result.session)
        res.cookie(SESSION_COOKIE, result.session.accessToken, {
          ...cookieOptions(),
          expires: result.session.expiresAt,
        });
      if (result.enrollment) res.cookie(enrollCookie, result.enrollment, options());
      res.clearCookie(challengeCookie, options());
      res.redirect(loadConfig().origins[0] + result.next);
    } catch {
      res.clearCookie(challengeCookie, options());
      res.redirect(loadConfig().origins[0] + '/login?google=failed');
    }
  }
  @Get('google/pending') async pending(@Req() req: Request) {
    const row = await this.google.pending(req);
    return { email: row.email, displayName: row.displayName };
  }
  @Post('google/complete')
  @UseGuards(BrowserOriginGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async complete(
    @Req() req: Request,
    @Body() dto: CompleteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.google.complete(req, dto);
    res.cookie(SESSION_COOKIE, result.session.accessToken, {
      ...cookieOptions(),
      expires: result.session.expiresAt,
    });
    res.clearCookie(enrollCookie, options());
    return { user: result.user, next: result.next };
  }
  @Get('google/connection') @UseGuards(SessionGuard) async connection(@Req() req: AuthRequest) {
    return {
      enabled: !!googleSettings(),
      connected: !!(await this.db.oAuthIdentity.findUnique({
        where: { userId_provider: { userId: req.account.id, provider: 'google' } },
      })),
      passwordEnabled: req.account.passwordEnabled,
    };
  }
  @Post('google/link')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async link(
    @Req() req: AuthRequest,
    @Body() dto: LinkDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      !req.account.passwordEnabled ||
      !(await verifyPassword(dto.password, req.account.passwordHash))
    )
      throw new UnauthorizedException('Confirm your current password');
    if (
      await this.db.oAuthIdentity.findUnique({
        where: { userId_provider: { userId: req.account.id, provider: 'google' } },
      })
    )
      throw new ConflictException('Google is already connected');
    const result = await this.google.start('/settings', {
      userId: req.account.id,
      sessionId: req.sessionId,
    });
    res.cookie(challengeCookie, result.state, options());
    return { url: result.url };
  }
  @Delete('google/connection')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async unlink(@Req() req: AuthRequest, @Body() dto: LinkDto) {
    if (
      !req.account.passwordEnabled ||
      !(await verifyPassword(dto.password, req.account.passwordHash))
    )
      throw new UnauthorizedException('Set and confirm a password before disconnecting Google');
    await this.db.oAuthIdentity.deleteMany({
      where: { userId: req.account.id, provider: 'google' },
    });
    return { ok: true };
  }
}
