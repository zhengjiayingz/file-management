import { IsString, Length, MinLength } from 'class-validator';

export class MfaDisableDto {
  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
