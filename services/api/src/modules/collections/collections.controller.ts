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
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { COLLECTION_PERMISSIONS } from './collections.permissions';
import { CollectionsService } from './collections.service';
import { RecordRepaymentDto } from './dto/record-repayment.dto';

@Controller('collections')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get('summary')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.collectionsService.getSummary(user);
  }

  @Get('due-today')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  listDueToday(@CurrentUser() user: AuthenticatedUser) {
    return this.collectionsService.listDueToday(user);
  }

  @Get('repayments')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  listRepayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('filter') filter?: string,
  ) {
    return this.collectionsService.listRepayments(user, filter);
  }

  @Get('clients/search')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  searchClients(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query = '',
  ) {
    return this.collectionsService.searchClients(user, query);
  }

  @Get('loans/:loanId')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  getLoanDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
  ) {
    return this.collectionsService.getLoanDetail(user, loanId);
  }

  @Post('repayments')
  @RequirePermissions(COLLECTION_PERMISSIONS.create)
  recordRepayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordRepaymentDto,
  ) {
    return this.collectionsService.recordRepayment(user, dto);
  }
}
