import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { fileUploadOptions } from '@/files/upload/file-upload.options';
import { MathTempImagesService } from '../services/math-temp-images.service';
import { MathTempChatService } from '../services/math-temp-chat.service';
import { MathTempStreamService } from '../services/math-temp-stream.service';
import { MathTempPromoteService } from '../services/math-temp-promote.service';
import {
  AppendTempChatMessageDto,
  SaveTempToDriveDto,
  TempStreamBodyDto,
} from '../dto/math-temp.dto';

@Controller('ai/math-temp-images')
export class MathTempImagesController {
  constructor(
    private readonly images: MathTempImagesService,
    private readonly chat: MathTempChatService,
    private readonly stream: MathTempStreamService,
    private readonly promote: MathTempPromoteService,
  ) {}

  /** 上传临时图 → tempImageId */
  @Post()
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  upload(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.images.upload(user.id, file);
  }

  @Delete(':tempImageId')
  @HttpCode(200)
  remove(
    @CurrentUser() user: RequestUser,
    @Param('tempImageId') tempImageId: string,
  ) {
    return this.images.remove(user.id, tempImageId);
  }

  @Get(':tempImageId/chat-sessions/:mode')
  getChatSession(
    @CurrentUser() user: RequestUser,
    @Param('tempImageId') tempImageId: string,
    @Param('mode') mode: string,
  ) {
    return this.chat.getOrCreateSession(user.id, tempImageId, mode);
  }

  @Delete(':tempImageId/chat-sessions/:mode')
  clearChatSession(
    @CurrentUser() user: RequestUser,
    @Param('tempImageId') tempImageId: string,
    @Param('mode') mode: string,
  ) {
    return this.chat.clearSession(user.id, tempImageId, mode);
  }

  @Post(':tempImageId/chat-sessions/:mode/messages')
  appendChatMessage(
    @CurrentUser() user: RequestUser,
    @Param('tempImageId') tempImageId: string,
    @Param('mode') mode: string,
    @Body() body: AppendTempChatMessageDto,
  ) {
    return this.chat.appendMessage(user.id, tempImageId, mode, body);
  }

  @Post(':tempImageId/ask')
  ask(
    @CurrentUser() user: RequestUser,
    @Param('tempImageId') tempImageId: string,
    @Body() body: TempStreamBodyDto,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    return this.stream.ask(req, res, user.id, tempImageId, body);
  }

  @Post(':tempImageId/solve')
  solve(
    @CurrentUser() user: RequestUser,
    @Param('tempImageId') tempImageId: string,
    @Body() body: TempStreamBodyDto,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    return this.stream.solve(req, res, user.id, tempImageId, body);
  }

  /** 路径①：存网盘 */
  @Post(':tempImageId/save-to-drive')
  saveToDrive(
    @CurrentUser() user: RequestUser,
    @Param('tempImageId') tempImageId: string,
    @Body() body: SaveTempToDriveDto,
  ) {
    return this.promote.saveToDrive(user.id, tempImageId, body ?? {});
  }
}
