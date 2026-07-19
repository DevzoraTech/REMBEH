import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ProfilePhotoPresignDto {
  @IsString()
  @MinLength(3)
  mimeType!: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  extension?: string;
}

export class ProfilePhotoConfirmDto {
  @IsString()
  @MinLength(3)
  storageKey!: string;

  @IsString()
  @MinLength(3)
  mimeType!: string;

  @IsInt()
  @Min(1)
  byteSize!: number;
}
