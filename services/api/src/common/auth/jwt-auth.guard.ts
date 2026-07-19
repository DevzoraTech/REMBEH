import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from './authenticated-user';
import { JwtTokenService } from './jwt-token.service';

type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization');

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token is required.');
    }

    const token = header.slice('Bearer '.length).trim();
    const payload = this.jwtTokenService.verifyAccessToken(token);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        tenant: true,
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('User session is no longer valid.');
    }

    if (
      user.status !== UserStatus.ACTIVE ||
      user.tenant.status !== TenantStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Account or user is not active.');
    }

    request.user = {
      userId: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId,
      email: user.email,
      displayName: user.displayName,
      permissions: [
        ...new Set(
          user.roles.flatMap((userRole) =>
            userRole.role.permissions.map(
              (rolePermission) => rolePermission.permission.key,
            ),
          ),
        ),
      ],
    };

    return true;
  }
}
