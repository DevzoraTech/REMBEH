import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CashShortagePaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { CashShortagesService } from './cash-shortages.service';

class RecordShortagePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000_000)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsEnum(CashShortagePaymentMethod)
  method?: CashShortagePaymentMethod;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

@Controller('cash-shortages')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CashShortagesController {
  constructor(private readonly shortagesService: CashShortagesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
  ) {
    return this.shortagesService.listForScope(user, {
      branchId,
      userId,
      status,
    });
  }

  @Get(':shortageId')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shortageId', ParseUUIDPipe) shortageId: string,
  ) {
    return this.shortagesService.getOne(user, shortageId);
  }

  @Post(':shortageId/payments')
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shortageId', ParseUUIDPipe) shortageId: string,
    @Body() dto: RecordShortagePaymentDto,
  ) {
    return this.shortagesService.recordPayment(user, shortageId, dto);
  }
}
