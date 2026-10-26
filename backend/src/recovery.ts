import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SessionGuard, type AuthRequest } from './auth';
import { EmailDto, ResetDto, TokenDto } from './feature-dtos';
import { RecoveryService } from './mail-tokens';
@Controller('account')
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}
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
