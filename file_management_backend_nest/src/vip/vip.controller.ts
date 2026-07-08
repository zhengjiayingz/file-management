import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { VipService } from './vip.service';

@Controller('vip')
export class VipController {
  constructor(private readonly vipService: VipService) {}

  @Get('tier-config')
  getVipTierComparisonConfig() {
    return this.vipService.getVipTierComparisonConfig();
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  applyVipUpgrade(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.vipService.applyVipUpgrade(user, req);
  }

  @Get('my-status')
  getMyVipRequestStatus(@CurrentUser() user: RequestUser) {
    return this.vipService.getMyVipRequestStatus(user);
  }

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles('admin')
  listPendingVipRequests() {
    return this.vipService.listPendingVipRequests();
  }

  @Post('requests/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  approveVipRequest(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.vipService.approveVipRequest(admin.id, id, req);
  }

  @Post('requests/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  rejectVipRequest(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.vipService.rejectVipRequest(admin.id, id);
  }

  @Post('applicant/:applicantId/approve')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  approveVipByApplicant(
    @CurrentUser() admin: RequestUser,
    @Param('applicantId', ParseIntPipe) applicantId: number,
    @Req() req: Request,
  ) {
    return this.vipService.approveVipByApplicant(admin.id, applicantId, req);
  }

  @Post('applicant/:applicantId/reject')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  rejectVipByApplicant(
    @CurrentUser() admin: RequestUser,
    @Param('applicantId', ParseIntPipe) applicantId: number,
  ) {
    return this.vipService.rejectVipByApplicant(admin.id, applicantId);
  }
}
