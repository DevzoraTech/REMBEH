import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { OpeningRecordService } from './opening-record.service';
import { OnboardingMediaService } from './onboarding-media.service';

@Controller('borrower-onboarding/records')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('branch.staff.invite')
export class OpeningRecordController {
  constructor(private readonly records: OpeningRecordService, private readonly media: OnboardingMediaService) {}

  @Post(':loanId/attachments')
  @HttpCode(200)
  prepareAttachment(@CurrentUser() user: AuthenticatedUser, @Param('loanId', ParseUUIDPipe) loanId: string, @Body() body: unknown) {
    return this.media.prepare(user, loanId, body);
  }

  @Post(':loanId/attachments/:uploadId/confirm')
  @HttpCode(200)
  confirmAttachment(@CurrentUser() user: AuthenticatedUser, @Param('loanId', ParseUUIDPipe) loanId: string, @Param('uploadId', ParseUUIDPipe) uploadId: string) {
    return this.media.confirm(user, loanId, uploadId);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.records.list(user);
  }

  @Post('check-duplicates')
  @HttpCode(200)
  check(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.records.checkDuplicates(user, body);
  }

  @Post()
  @HttpCode(200)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.records.create(user, body);
  }
}
