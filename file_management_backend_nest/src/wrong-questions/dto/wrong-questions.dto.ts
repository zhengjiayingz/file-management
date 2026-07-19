import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 错题难度：简单 / 中档 / 困难 */
export const WRONG_QUESTION_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type WrongQuestionDifficulty = (typeof WRONG_QUESTION_DIFFICULTIES)[number];

/** 创建错题本条目（MVP 要求网盘 userFileId；题干可空，服务端 OCR 补全） */
export class CreateWrongQuestionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userFileId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  questionText?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  answerText!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(WRONG_QUESTION_DIFFICULTIES)
  difficulty?: WrongQuestionDifficulty;
}

/** 更新错题本条目（题干 / 解答 / 标签 / 难度均可选） */
export class UpdateWrongQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  questionText?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  answerText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(WRONG_QUESTION_DIFFICULTIES)
  difficulty?: WrongQuestionDifficulty;
}

/** 列表分页与可选考点 / 难度 / 存入时间筛选 */
export class ListWrongQuestionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @IsOptional()
  @IsIn(WRONG_QUESTION_DIFFICULTIES)
  difficulty?: WrongQuestionDifficulty;

  /** 存入时间起（含当日 00:00，建议 YYYY-MM-DD） */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  createdFrom?: string;

  /** 存入时间止（含当日 23:59:59.999，建议 YYYY-MM-DD） */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  createdTo?: string;
}
