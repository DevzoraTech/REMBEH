import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { VerifyNinDto } from './dto/verify-nin.dto';
import { IdentityVerificationService } from './identity-verification.service';

@Controller('identity')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IdentityVerificationController {
  constructor(
    private readonly identityVerificationService: IdentityVerificationService,
  ) {}

  @Post('verify-nin')
  @RequirePermissions('loan.create')
  async verifyNin(@Body() dto: VerifyNinDto) {
    const result = await this.identityVerificationService.verifyNationalId({
      nationalId: dto.nationalId,
      country: dto.country,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phoneNumber: dto.phoneNumber,
      gender: dto.gender,
      dob: dto.dob,
    });

    return { verification: result };
  }
}
