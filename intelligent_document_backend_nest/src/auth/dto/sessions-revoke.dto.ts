import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class SessionsRevokeDto {
  @IsArray()
  @IsInt({ each: true })
  ids!: number[];

  @IsOptional()
  @IsString()
  refreshToken?: string;
}
