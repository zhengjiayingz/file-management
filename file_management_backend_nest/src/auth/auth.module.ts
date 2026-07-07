import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LoginRateLimitMiddleware } from '../common/middleware/login-rate-limit.middleware';
import { PasswordPolicyService } from '../common/password-policy/password-policy.service';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';

import { PasswordService } from './services/password.service';
import { MfaService } from './services/mfa.service';
import { SessionService } from './services/session.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    PasswordService,
    MfaService,
    PasswordPolicyService,
  ],
  exports: [AuthService, SessionService, JwtModule],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoginRateLimitMiddleware)
      .forRoutes({ path: 'auth/login', method: RequestMethod.POST });
  }
}
