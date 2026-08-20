import {
  IsString,
  IsArray,
  ValidateNested,
  IsISO8601,
  IsObject,
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
}

export class UploadQueueDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperationDto)
  operations: OperationDto[];
}
