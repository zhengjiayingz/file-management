import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
  Body,
} from '@nestjs/common';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('system-settings')
  getAdminSystemSettings() {
    return this.adminService.getAdminSystemSettings();
  }

  @Put('system-settings')
  updateAdminSystemSettings(
    @Body()
    body: {
      passwordMinLength?: number;
      passwordRequiredCategories?: unknown;
      passwordMinCategoriesInPool?: number;
      storageQuotaUserBytes?: string | number;
      storageQuotaVipBytes?: string | number;
      storageQuotaAdminBytes?: string | number;
      maxTagsUser?: number;
      maxTagsVip?: number;
    },
  ) {
    return this.adminService.updateAdminSystemSettings(body);
  }

  @Post('sync-friendships')
  @HttpCode(HttpStatus.OK)
  syncFriendshipsWithAdmin() {
    return this.adminService.syncFriendshipsWithAdmin();
  }

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status?: unknown },
  ) {
    return this.adminService.updateUserStatus(admin.id, id, body.status);
  }

  @Patch('users/:id/tts')
  updateUserTts(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { enabled?: unknown },
  ) {
    return this.adminService.updateUserTts(id, body.enabled);
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetUserPassword(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.resetUserPassword(id);
  }

  @Post('users/:id/kick-sessions')
  @HttpCode(HttpStatus.OK)
  kickUserSessions(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminService.kickUserSessions(admin.id, id);
  }

  @Post('users/:id/clear-session-kick-marker')
  @HttpCode(HttpStatus.OK)
  clearUserSessionKickMarker(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.clearUserSessionKickMarker(id);
  }
}
