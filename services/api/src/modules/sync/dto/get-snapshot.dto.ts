import { IsString, IsOptional, IsISO8601 } from 'class-validator';

export class GetSnapshotDto {
  @IsOptional()
  @IsISO8601()
  lastSyncAt?: string;
}
