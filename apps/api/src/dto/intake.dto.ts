import {
  IsBoolean, IsEmail, IsOptional, IsString, IsArray, MaxLength, MinLength,
  ValidateIf,
} from 'class-validator';

export class PublicIntakeDto {
  @IsOptional() @IsString() @MaxLength(40)
  name?: string;

  @ValidateIf((o) => !o.email)
  @IsString() @MinLength(6) @MaxLength(20)
  phone?: string;

  @ValidateIf((o) => !o.phone)
  @IsEmail() @MaxLength(120)
  email?: string;

  @IsOptional() @IsString() @MaxLength(120)
  company_name?: string;

  @IsOptional() @IsString() @MaxLength(40)
  product_code?: string;

  @IsOptional() @IsString() @MaxLength(64)
  source_type?: string;

  @IsOptional() @IsString() @MaxLength(64)
  source_channel?: string;

  @IsOptional() @IsString() @MaxLength(64)
  campaign?: string;

  @IsOptional() @IsString() @MaxLength(32)
  path?: string;

  @IsBoolean()
  consent_accepted!: boolean;

  @IsOptional() @IsArray() @IsString({ each: true })
  consent_channels?: string[];

  @IsOptional() @IsString() @MaxLength(2000)
  consent_text?: string;

  @IsOptional() @IsString() @MaxLength(40)
  consent_version?: string;

  @IsOptional() @IsString() @MaxLength(64) utm_source?: string;
  @IsOptional() @IsString() @MaxLength(64) utm_medium?: string;
  @IsOptional() @IsString() @MaxLength(64) utm_campaign?: string;
  @IsOptional() @IsString() @MaxLength(64) utm_content?: string;
  @IsOptional() @IsString() @MaxLength(64) utm_term?: string;
  @IsOptional() @IsString() @MaxLength(64) invite_code?: string;
  @IsOptional() @IsString() @MaxLength(500) landing_url?: string;
  @IsOptional() @IsString() @MaxLength(64) form_id?: string;
}
