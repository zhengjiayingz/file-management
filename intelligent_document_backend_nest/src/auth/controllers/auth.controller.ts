import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { AuthService } from '../services/auth.service';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { LoginDto } from '../dto/login.dto';
import { LogoutDto } from '../dto/logout.dto';
import { MfaDisableDto } from '../dto/mfa-disable.dto';
import { MfaSetupConfirmDto } from '../dto/mfa-setup-confirm.dto';
import { MfaVerifyDto } from '../dto/mfa-verify.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RegisterDto } from '../dto/register.dto';
import { SessionsListDto } from '../dto/sessions-list.dto';
import { SessionsRevokeDto } from '../dto/sessions-revoke.dto';
import { MfaService } from '../services/mfa.service';
import { PasswordService } from '../services/password.service';
import { SessionService } from '../services/session.service';
import type { RequestUser } from '../types/jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordService: PasswordService,
    private readonly mfaService: MfaService,
    private readonly sessionService: SessionService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.passwordService.register(dto, req);
  }

  @Public()
  @Get('password-policy')
  getPasswordPolicy() {
    return this.authService.getPasswordPolicy();
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request) {
    return this.mfaService.verifyMfaLogin(dto, req);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordService.forgotPassword(dto.username);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.passwordService.changePassword(user.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('mfa/setup/start')
  mfaSetupStart(@CurrentUser() user: RequestUser) {
    return this.mfaService.setupStart(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('mfa/setup/confirm')
  mfaSetupConfirm(
    @CurrentUser() user: RequestUser,
    @Body() dto: MfaSetupConfirmDto,
  ) {
    return this.mfaService.setupConfirm(user.id, dto.code);
  }

  @HttpCode(HttpStatus.OK)
  @Post('mfa/setup/cancel')
  mfaSetupCancel(@CurrentUser() user: RequestUser) {
    return this.mfaService.setupCancel(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('mfa/disable')
  mfaDisable(@CurrentUser() user: RequestUser, @Body() dto: MfaDisableDto) {
    return this.mfaService.disable(user.id, dto.password, dto.code);
  }

  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return this.authService.getCurrentUser(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('sessions/list')
  listSessions(@CurrentUser() user: RequestUser, @Body() dto: SessionsListDto) {
    return this.sessionService.listSessionsForUser(user.id, dto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @Post('sessions/revoke')
  revokeSessions(
    @CurrentUser() user: RequestUser,
    @Body() dto: SessionsRevokeDto,
  ) {
    return this.sessionService.revokeSessions(
      user.id,
      dto.ids,
      dto.refreshToken,
    );
  }
}
