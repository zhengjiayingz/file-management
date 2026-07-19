import { Module } from '@nestjs/common';
import { WrongQuestionsController } from './controllers/wrong-questions.controller';
import { WrongQuestionsService } from './services/wrong-questions.service';
import { WrongQuestionsFollowUpService } from './services/wrong-questions-follow-up.service';

@Module({
  controllers: [WrongQuestionsController],
  providers: [WrongQuestionsService, WrongQuestionsFollowUpService],
  exports: [WrongQuestionsService],
})
export class WrongQuestionsModule {}
