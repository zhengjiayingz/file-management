import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { UpdateUserPreferenceDto } from '../dto/update-user-preference.dto';
import { UserPreferenceService } from '../services/user-preference.service';

@Controller('user-preferences')
export class UserPreferenceController {
  constructor(private readonly userPreferenceService: UserPreferenceService) {}

  @Get()
  getPreference(@CurrentUser() user: RequestUser) {
    return this.userPreferenceService.getPreference(user.id);
  }

  @Put()
  updatePreference(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateUserPreferenceDto,
  ) {
    return this.userPreferenceService.updatePreference(user.id, dto);
  }
}
