import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UserService } from '../services/user.service';
import { avatarUploadOptions } from '../utils/avatar-upload.options';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: RequestUser) {
    return this.userService.getProfile(user.id);
  }

  @Put('profile')
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.id, dto);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', avatarUploadOptions))
  uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.userService.uploadAvatar(user.id, file);
  }

  @Get('search')
  searchUsers(
    @CurrentUser() user: RequestUser,
    @Query('keyword') keyword?: string,
  ) {
    return this.userService.searchUsers(user.id, keyword);
  }
}
