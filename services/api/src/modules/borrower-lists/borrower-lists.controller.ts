import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { BorrowerListsService } from './borrower-lists.service';
import { BORROWER_LIST_PERMISSIONS } from './borrower-lists.permissions';
import {
  CreateBorrowerListEntryDto,
  UpdateBorrowerListEntryDto,
} from './dto/borrower-list-entry.dto';

@Controller('borrower-lists')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BorrowerListsController {
  constructor(private readonly borrowerListsService: BorrowerListsService) {}

  @Get()
  @RequirePermissions(BORROWER_LIST_PERMISSIONS.read)
  listEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type?: string,
  ) {
    return this.borrowerListsService.listEntries(user, type);
  }

  @Post()
  @RequirePermissions(BORROWER_LIST_PERMISSIONS.manage)
  saveEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBorrowerListEntryDto,
  ) {
    return this.borrowerListsService.saveEntry(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(BORROWER_LIST_PERMISSIONS.manage)
  updateEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBorrowerListEntryDto,
  ) {
    return this.borrowerListsService.updateEntry(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(BORROWER_LIST_PERMISSIONS.manage)
  removeEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.borrowerListsService.removeEntry(user, id);
  }
}
