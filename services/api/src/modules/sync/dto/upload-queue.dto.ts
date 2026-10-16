import {
  IsString,
  IsArray,
  ValidateNested,
  IsISO8601,
  IsObject,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OperationDto {
  @IsString()
  localId: string;

  @IsString()
  type: string;

  @IsISO8601()
  createdAt: string;

  @IsObject()
  payload: Record<string, any>;

  /**
   * Present only when a branch manager relays a field officer's locally
   * recorded work. The API validates the actor belongs to the same branch.
   */
  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}

export class UploadQueueDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperationDto)
  operations: OperationDto[];
}
