import { Module } from '@nestjs/common';
import { KnowledgeBasesController } from './controllers/knowledge-bases.controller';
import { KnowledgeBasesAccessHelper } from './helpers/knowledge-bases-access.helper';
import { KnowledgeBasesService } from './service/knowledge-bases.service';
import { KnowledgeBasesChatService } from './service/knowledge-bases-chat.service';
import { KnowledgeBasesSessionService } from './service/knowledge-bases-session.service';

@Module({
  controllers: [KnowledgeBasesController],
  providers: [
    KnowledgeBasesAccessHelper,
    KnowledgeBasesService,
    KnowledgeBasesChatService,
    KnowledgeBasesSessionService,
  ],
  exports: [KnowledgeBasesService],
})
export class KnowledgeBasesModule {}
