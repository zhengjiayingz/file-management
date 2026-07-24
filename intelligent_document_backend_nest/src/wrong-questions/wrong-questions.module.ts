import { Module } from '@nestjs/common';
import { MathTempModule } from '@/math-temp/math-temp.module';
import { WrongQuestionsController } from './controllers/wrong-questions.controller';
import { WrongQuestionsService } from './services/wrong-questions.service';
import { WrongQuestionsFollowUpService } from './services/wrong-questions-follow-up.service';

@Module({
  imports: [MathTempModule],
  controllers: [WrongQuestionsController],
  providers: [WrongQuestionsService, WrongQuestionsFollowUpService],
  exports: [WrongQuestionsService],
})
export class WrongQuestionsModule {}
