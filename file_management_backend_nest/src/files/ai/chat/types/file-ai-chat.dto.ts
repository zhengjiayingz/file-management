import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const FILE_AI_CHAT_MODES = ['selection', 'rag', 'solve'] as const;
export type FileAiChatModeDto = (typeof FILE_AI_CHAT_MODES)[number];

export const FILE_AI_CHAT_ROLES = ['user', 'assistant'] as const;
export type FileAiChatRoleDto = (typeof FILE_AI_CHAT_ROLES)[number];

/** 追加一条落盘消息（流式成功后由前端提交） */
export class AppendFileAiChatMessageDto {
  @IsIn(FILE_AI_CHAT_ROLES)
  role!: FileAiChatRoleDto;

  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  content!: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
