import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FriendshipService } from './friendship.service';

@Controller('friendships')
export class FriendshipController {
  constructor(private readonly friendshipService: FriendshipService) {}

  @Get()
  getFriendsList(@CurrentUser() user: RequestUser) {
    return this.friendshipService.getFriendsList(user.id);
  }

  @Get('requests/pending')
  getPendingRequests(@CurrentUser() user: RequestUser) {
    return this.friendshipService.getPendingRequests(user.id);
  }

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  sendFriendRequest(
    @CurrentUser() user: RequestUser,
    @Body() body: { friendUsername?: unknown; friendId?: unknown },
  ) {
    return this.friendshipService.sendFriendRequest(user.id, body);
  }

  @Put('request/:requestId/accept')
  acceptFriendRequest(
    @CurrentUser() user: RequestUser,
    @Param('requestId', ParseIntPipe) requestId: number,
  ) {
    return this.friendshipService.acceptFriendRequest(user.id, requestId);
  }

  @Put('request/:requestId/reject')
  rejectFriendRequest(
    @CurrentUser() user: RequestUser,
    @Param('requestId', ParseIntPipe) requestId: number,
  ) {
    return this.friendshipService.rejectFriendRequest(user.id, requestId);
  }

  @Delete(':friendId')
  removeFriend(
    @CurrentUser() user: RequestUser,
    @Param('friendId', ParseIntPipe) friendId: number,
  ) {
    return this.friendshipService.removeFriend(user.id, friendId);
  }
}
