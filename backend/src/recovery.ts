import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Database } from './database';
import { verifyPassword } from './security';
class ChangeEmailDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MaxLength(128) password!: string;
}
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SessionGuard, type AuthRequest } from './auth';
import { EmailDto, ResetDto, TokenDto } from './feature-dtos';
import { RecoveryService } from './mail-tokens';
@Controller('account')
export class RecoveryController {
  constructor(
    private readonly recovery: RecoveryService,
    private readonly db: Database,
  ) {}
  @Post('change-unverified-email')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  async changeEmail(@Body() dto: ChangeEmailDto, @Req() req: AuthRequest) {
    if (req.account.emailVerifiedAt)
      throw new BadRequestException('This address is already verified');
    if (
      !req.account.passwordEnabled ||
      !(await verifyPassword(dto.password, req.account.passwordHash))
    )
      throw new UnauthorizedException('Current password required');
    const email = dto.email.trim().toLowerCase();
    await this.db.$transaction(async (tx) => {
      if (await tx.user.findFirst({ where: { email, id: { not: req.account.id } } }))
        throw new ConflictException('That address is unavailable');
      const changed = await tx.user.updateMany({
        where: { id: req.account.id, emailVerifiedAt: null },
        data: { email, discoverByEmail: false },
      });
      if (changed.count !== 1)
        throw new BadRequestException('Email was already verified; refresh your account');
      await tx.actionToken.deleteMany({ where: { userId: req.account.id, purpose: 'VERIFY' } });
    });
    return { ok: true };
  }
  @Post('forgot-password') @Throttle({ default: { limit: 5, ttl: 60000 } }) forgot(
    @Body() dto: EmailDto,
  ) {
    return this.recovery.forgot(dto.email);
  }
  @Post('reset-password') @Throttle({ default: { limit: 10, ttl: 60000 } }) reset(
    @Body() dto: ResetDto,
  ) {
    return this.recovery.consume(dto.token, 'RESET', dto.password);
  }
  @Post('verify-email') @Throttle({ default: { limit: 10, ttl: 60000 } }) verify(
    @Body() dto: TokenDto,
  ) {
    return this.recovery.consume(dto.token, 'VERIFY');
  }
  @Post('send-verification')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resend(@Req() req: AuthRequest) {
    if (!req.account.emailVerifiedAt) await this.recovery.send(req.account.id, 'VERIFY');
    return { message: 'Verification instructions sent if needed.' };
  }
}
