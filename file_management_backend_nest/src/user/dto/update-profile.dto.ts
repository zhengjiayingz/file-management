import { IsOptional } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  email?: string | null;
}
