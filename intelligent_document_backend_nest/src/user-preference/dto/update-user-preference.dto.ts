import { IsIn, IsOptional } from 'class-validator';

export class UpdateUserPreferenceDto {
  @IsOptional()
  @IsIn(['zh-CN', 'zh-TW', 'en-US', 'auto'])
  locale?: string;

  @IsOptional()
  @IsIn(['light', 'dark', 'auto'])
  theme?: string;
}
