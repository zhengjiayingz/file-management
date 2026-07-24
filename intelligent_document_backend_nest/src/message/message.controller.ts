import {
  Body,
  Controller,
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
import { MessageService } from './message.service';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('unread-summary')
  getUnreadSummary(@CurrentUser() user: RequestUser) {
    return this.messageService.getUnreadSummary(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      receiverId?: unknown;
      content?: unknown;
      messageType?: unknown;
      fileId?: unknown;
    },
  ) {
    return this.messageService.sendMessage(user.id, body);
  }

  @Put(':friendId/read')
  markAsRead(
    @CurrentUser() user: RequestUser,
    @Param('friendId', ParseIntPipe) friendId: number,
  ) {
    return this.messageService.markAsRead(user.id, friendId);
  }

  @Get(':friendId')
  getChatHistory(
    @CurrentUser() user: RequestUser,
    @Param('friendId', ParseIntPipe) friendId: number,
  ) {
    return this.messageService.getChatHistory(user.id, friendId);
  }
}
