import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ExchangeOAuthTicketDto {
  @IsUUID()
  ticketId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  deviceType?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  platform?: string;
}
