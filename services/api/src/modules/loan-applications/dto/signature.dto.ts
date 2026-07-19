import { LoanApplicationSignerRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class SignaturePresignDto {
  @IsEnum(LoanApplicationSignerRole)
  signerRole!: LoanApplicationSignerRole;

  /**
   * When a locked signature already exists for this role, set true to create
   * a new version. Overwrite of a locked version is always rejected.
   */
  @IsOptional()
  @IsBoolean()
  createNewVersion?: boolean;
}

export class SignatureConfirmDto {
  @IsEnum(LoanApplicationSignerRole)
  signerRole!: LoanApplicationSignerRole;

  @IsString()
  @MinLength(3)
  signatureStorageKey!: string;

  @IsString()
  @MinLength(3)
  strokesStorageKey!: string;

  @IsString()
  @MinLength(3)
  metadataStorageKey!: string;

  @IsInt()
  @Min(1)
  signatureByteSize!: number;

  @IsInt()
  @Min(1)
  strokesByteSize!: number;

  @IsInt()
  @Min(1)
  metadataByteSize!: number;

  @IsString()
  @MinLength(8)
  pngContentHash!: string;

  @IsString()
  @MinLength(8)
  strokesContentHash!: string;

  @IsString()
  @MinLength(1)
  signerName!: string;

  @IsString()
  @MinLength(1)
  signedAt!: string;

  @IsObject()
  metadata!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  createNewVersion?: boolean;
}
