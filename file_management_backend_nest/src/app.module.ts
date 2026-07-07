import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AdminFriendModule } from './common/admin-friend/admin-friend.module';
import { AuthModule } from './auth/auth.module';
import { MustChangePasswordGuard } from './common/guards/must-change-password.guard';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { UserModule } from './user/user.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { StorageModule } from './storage/storage.module';
import { FilesModule } from './files/files.module';
import { UserPreferenceModule } from './user-preference/user-preference.module';
import { FriendshipModule } from './friendship/friendship.module';
import { MessageModule } from './message/message.module';
import { ShareModule } from './share/share.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: {
          ignore: (req) =>
            req.method === 'OPTIONS' ||
            req.url === '/health' ||
            req.url?.startsWith('/api-docs') === true,
        },
      },
    }),
    PrismaModule,
    StorageModule,
    RedisModule,
    RateLimitModule,
    AdminFriendModule,
    HealthModule,
    AuthModule,
    UserModule,
    UserPreferenceModule,
    FilesModule,
    FriendshipModule,
    MessageModule,
    ShareModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MustChangePasswordGuard },
  ],
})
export class AppModule {}
