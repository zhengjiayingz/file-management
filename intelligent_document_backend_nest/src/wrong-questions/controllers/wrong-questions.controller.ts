import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import {
  CreateWrongQuestionDto,
  CreateWrongQuestionFromTempDto,
  ListWrongQuestionsQueryDto,
  UpdateWrongQuestionDto,
} from '../dto/wrong-questions.dto';
import { WrongQuestionsService } from '../services/wrong-questions.service';
import { WrongQuestionsFollowUpService } from '../services/wrong-questions-follow-up.service';

@Controller('wrong-questions')
export class WrongQuestionsController {
  constructor(
    private readonly wrongQuestionsService: WrongQuestionsService,
    private readonly followUpService: WrongQuestionsFollowUpService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateWrongQuestionDto,
  ) {
    return this.wrongQuestionsService.create(user.id, dto);
  }

  /** 临时图转正并写入错题本（插件路径） */
  @Post('from-temp')
  createFromTemp(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateWrongQuestionFromTempDto,
  ) {
    return this.wrongQuestionsService.createFromTemp(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListWrongQuestionsQueryDto,
  ) {
    return this.wrongQuestionsService.list(user.id, query);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.wrongQuestionsService.getOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWrongQuestionDto,
  ) {
    return this.wrongQuestionsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.wrongQuestionsService.remove(user.id, id);
  }

  @Post(':id/refresh-question')
  refreshQuestion(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.wrongQuestionsService.refreshQuestionFromOcr(user.id, id);
  }

  @Post(':id/follow-up')
  async followUp(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.followUpService.followUp(req, res, user.id, id, body);
  }
}
