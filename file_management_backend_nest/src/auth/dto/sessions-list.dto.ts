import { IsOptional, IsString } from 'class-validator';

export class SessionsListDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
