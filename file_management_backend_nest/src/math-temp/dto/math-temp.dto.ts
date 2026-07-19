import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FILE_AI_CHAT_ROLES,
  type FileAiChatRoleDto,
} from '@/files/ai/dto/file-ai-chat.dto';

/** temp 会话仅 selection（问答）/ solve（解题） */
export const TEMP_AI_CHAT_MODES = ['selection', 'solve'] as const;
export type TempAiChatModeDto = (typeof TEMP_AI_CHAT_MODES)[number];

export class TempStreamBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  question!: string;

  @IsOptional()
  messages?: { role: 'user' | 'assistant'; content: string }[];
}

export class AppendTempChatMessageDto {
  @IsIn(FILE_AI_CHAT_ROLES)
  role!: FileAiChatRoleDto;

  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  content!: string;
}

export class SaveTempToDriveDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  folderId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsBoolean()
  includeTranscript?: boolean;

  /** 复制 temp selection 会话到网盘文件会话 */
  @IsOptional()
  @IsBoolean()
  copyChat?: boolean;
}

export function assertTempChatMode(raw: string): TempAiChatModeDto {
  if ((TEMP_AI_CHAT_MODES as readonly string[]).includes(raw)) {
    return raw as TempAiChatModeDto;
  }
  throw new Error('无效的对话模式');
}
