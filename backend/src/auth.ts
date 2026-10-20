import { BadRequestException, Query, Body, CanActivate, ConflictException, Controller, ExecutionContext, Get, HttpCode, Injectable, Post, Req, Res, ForbiddenException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma, User } from '@prisma/client';
import { Request, Response } from 'express';
import { loadConfig } from './config';
import { RecoveryService } from './mail-tokens';
import { Database } from './database';
import { LoginDto, RegisterDto } from './dtos';
import { hashPassword, newToken, tokenHash, verifyPassword } from './security';
export const publicUser = {occupation:true,skills:true, profileCoverMediaId:true,campusIdentity:true, location:true, avatarMediaId:true, id: true, username: true, displayName: true, bio: true, website: true, department: true, createdAt: true } as const;
export function birthDate(value?:string|null){if(!value)return null;const date=new Date(value+'T00:00:00.000Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||value<'1900-01-01'||value>new Date().toISOString().slice(0,10))throw new BadRequestException('Enter a valid date of birth that is not in the future');return date;}
export type AuthRequest = Request & { account: User; sessionId: string; permissions: string[]; roleNames: string[] };
@Injectable()
export class AuthService {
  constructor(private readonly db: Database, private readonly recovery: RecoveryService) {}
  async issue(user: Pick<User, 'id'>) {
    const accessToken = newToken();
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    await this.db.session.create({ data: { userId: user.id, tokenHash: tokenHash(accessToken), expiresAt } });
    return { accessToken, tokenType: 'Bearer', expiresAt };
  }
  async register(dto: RegisterDto) {
    if(dto.topicIds?.length&&await this.db.topic.count({where:{id:{in:dto.topicIds}}})!==dto.topicIds.length)throw new ForbiddenException('Unknown interest topic');
    if(reservedUsername(dto.username))throw new BadRequestException('Choose a different username');
    const dateOfBirth=birthDate(dto.dateOfBirth);
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.db.user.create({ data: {gender:dto.gender,occupation:dto.occupation,skills:dto.skills,onboardingStage:dto.topicIds?.length?'PEOPLE':'TOPICS', phoneNumber:dto.phoneNumber,dateOfBirth,location:dto.location,email: dto.email, username: dto.username, displayName: dto.displayName, passwordHash, roles:{create:{role:{connect:{key:'member'}}}} }, select: publicUser });
      if(dto.topicIds?.length)await this.db.userInterest.createMany({data:dto.topicIds.map(topicId=>({userId:user.id,topicId})),skipDuplicates:true});
      const session=await this.issue(user);
      // Account creation remains successful if email delivery is temporarily unavailable; resend is available.
      try{await this.recovery.send(user.id,'VERIFY');}catch{console.warn('Verification delivery unavailable; user can resend.');}
      return { user, ...session };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Email or username is unavailable');
      throw e;
    }
  }
  async login(dto: LoginDto) {
    const identity=(dto.identifier??dto.email??'').trim().toLowerCase();if(!identity)throw new BadRequestException('Enter your email or username');
    const user=await this.db.user.findUnique({where:identity.includes('@')&&!identity.startsWith('@')?{email:identity}:{username:identity.replace(/^@/,'')}});
    // Run password derivation for unknown users too, reducing account-enumeration timing differences.
    const hash = user?.passwordHash ?? 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);
    const valid = await verifyPassword(dto.password, hash);
    if (!user || !valid || !user.passwordEnabled || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid credentials');
    const { passwordHash: _, ...safe } = user;
    return { user: { id: safe.id, username: safe.username, displayName: safe.displayName, bio: safe.bio, createdAt: safe.createdAt }, ...await this.issue(user) };
  }
}
export const reservedUsername=(name:string)=>['admin','administrator','support','official','fpiupdates','fpi_updates','security','moderator'].includes(name.toLowerCase());
export const SESSION_COOKIE = 'fpi_session';
export function checkBrowserOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin || !loadConfig().origins.includes(origin)) throw new ForbiddenException('Untrusted browser origin');
}
export function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/v1' };
}
@Injectable()
export class BrowserOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) { checkBrowserOrigin(context.switchToHttp().getRequest<Request>()); return true; }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly db: Database) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '');
    let token = match?.[1];
    if (!token) {
      // Prefer an explicit bearer credential; invalid Authorization must not fall back to a cookie.
      if (req.headers.authorization) throw new UnauthorizedException();
      const raw = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
      if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new UnauthorizedException();
      token = raw;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) checkBrowserOrigin(req);
    }
    const session = await this.db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { include: { roles: { include: { role: true } } } } } });
    if (!session || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') throw new UnauthorizedException();
    req.account = session.user; req.sessionId = session.id; req.permissions = [...new Set(session.user.roles.flatMap(entry=>entry.role.permissions))]; req.roleNames = session.user.roles.map(entry=>entry.role.name);
    return true;
  }
}
@Injectable()
export class OptionalSessionGuard extends SessionGuard {
 constructor(db:Database){super(db);}
 async canActivate(context:ExecutionContext){try{return await super.canActivate(context);}catch(error){if(error instanceof UnauthorizedException)return true;throw error;}}
}
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly db: Database) {}
  @Post('register') @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Post('login') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Post('browser/register') @UseGuards(BrowserOriginGuard) @Throttle({ default: { limit: 5, ttl: 60000 } })
  async browserRegister(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto);
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(SESSION_COOKIE, result.accessToken, { ...cookieOptions(), expires: result.expiresAt });
    return { user: result.user, expiresAt: result.expiresAt };
  }
  @Post('browser/login') @HttpCode(200) @UseGuards(BrowserOriginGuard) @Throttle({ default: { limit: 10, ttl: 60000 } })
  async browserLogin(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto);
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(SESSION_COOKIE, result.accessToken, { ...cookieOptions(), expires: result.expiresAt });
    return { user: result.user, expiresAt: result.expiresAt };
  }
  @Get('me') @UseGuards(SessionGuard)
  async me(@Req() req: AuthRequest) { return {gender:req.account.gender,occupation:req.account.occupation,skills:req.account.skills,onboardingStage:req.account.onboardingStage, profileCoverMediaId:req.account.profileCoverMediaId,campusIdentity:req.account.campusIdentity,phoneNumber:req.account.phoneNumber,dateOfBirth:req.account.dateOfBirth?.toISOString().slice(0,10)??null,location:req.account.location,avatarMediaId:req.account.avatarMediaId, id: req.account.id, email: req.account.email, username: req.account.username, displayName: req.account.displayName, bio: req.account.bio, website:req.account.website, department:req.account.department, permissions:req.permissions, roles:req.roleNames, interests:await this.db.userInterest.findMany({where:{userId:req.account.id},include:{topic:true}}), emailVerified: !!req.account.emailVerifiedAt }; }
  @Get('username-availability') @UseGuards(OptionalSessionGuard) @Throttle({default:{ttl:60000,limit:30}})
  async username(@Query('username')value:string,@Req()req:AuthRequest){const username=(typeof value==='string'?value:'').trim().toLowerCase();if(!/^[a-z0-9_]{3,30}$/.test(username)||(reservedUsername(username)&&username!==req.account?.username))return {available:false,valid:false};const found=await this.db.user.findUnique({where:{username},select:{id:true}});return {available:!found||found.id===req.account?.id,valid:true};}
  @Get('username-suggestions') @Throttle({default:{limit:30,ttl:60000}})
  async suggestions(@Query('name')raw:unknown){if(typeof raw!=='string'||raw.length>80)throw new BadRequestException('Use a name up to 80 characters');let base=raw.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,22);if(base.length<3)base='member';const suffix=newToken().replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,5);const candidates=[base,base+'_il',base+'_'+suffix,base+'_'+suffix+'1'].filter(n=>!reservedUsername(n));const taken=await this.db.user.findMany({where:{username:{in:candidates}},select:{username:true}});return candidates.filter(n=>!taken.some(u=>u.username===n)).slice(0,3);}
  @Post('logout') @HttpCode(204) @UseGuards(SessionGuard)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) { await this.db.pushDevice.deleteMany({where:{sessionId:req.sessionId}}); await this.db.session.deleteMany({ where: { id: req.sessionId } }); res.clearCookie(SESSION_COOKIE, cookieOptions()); }
}
