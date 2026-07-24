import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupTasksService } from './cleanup-tasks.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CleanupTasksService],
  exports: [CleanupTasksService],
})
export class JobsModule {}
