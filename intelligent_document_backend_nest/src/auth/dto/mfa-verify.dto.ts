import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  @MinLength(1)
  mfaToken!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsInt()
  revokeSessionId?: number;
}
