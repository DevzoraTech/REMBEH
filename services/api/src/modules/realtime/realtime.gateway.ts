import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { TenantStatus, UserStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { JwtTokenService } from '../../common/auth/jwt-token.service';
import { PrismaService } from '../../database/prisma.service';
import type { LoanApplicationRealtimePayload } from './realtime.events';

type SocketUser = {
  userId: string;
  tenantId: string;
  branchId: string | null;
  permissions: string[];
};

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtTokenService.verifyAccessToken(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          tenant: true,
          roles: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      });

      if (
        !user ||
        user.tenantId !== payload.tenantId ||
        user.status !== UserStatus.ACTIVE ||
        user.tenant.status !== TenantStatus.ACTIVE
      ) {
        client.disconnect(true);
        return;
      }

      const socketUser: SocketUser = {
        userId: user.id,
        tenantId: user.tenantId,
        branchId: user.branchId,
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

      client.data.user = socketUser;
      await client.join(this.tenantRoom(socketUser.tenantId));
      if (socketUser.branchId) {
        await client.join(this.branchRoom(socketUser.branchId));
      }

      this.logger.debug(
        `Socket connected user=${socketUser.userId} tenant=${socketUser.tenantId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Socket auth failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    if (user) {
      this.logger.debug(`Socket disconnected user=${user.userId}`);
    }
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { branchId?: string },
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      return { ok: false };
    }

    if (body?.branchId && user.branchId === body.branchId) {
      await client.join(this.branchRoom(body.branchId));
    }

    return {
      ok: true,
      rooms: {
        tenant: this.tenantRoom(user.tenantId),
        branch: user.branchId ? this.branchRoom(user.branchId) : null,
      },
    };
  }

  emitToTenant(tenantId: string, event: string, payload: unknown) {
    this.server.to(this.tenantRoom(tenantId)).emit(event, payload);
  }

  emitToBranch(branchId: string, event: string, payload: unknown) {
    this.server.to(this.branchRoom(branchId)).emit(event, payload);
  }

  broadcastLoanApplication(
    event: string,
    payload: LoanApplicationRealtimePayload,
  ) {
    this.emitToTenant(payload.tenantId, event, payload);
    this.emitToBranch(payload.branchId, event, payload);
  }

  private tenantRoom(tenantId: string) {
    return `tenant:${tenantId}`;
  }

  private branchRoom(branchId: string) {
    return `branch:${branchId}`;
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    const queryToken = client.handshake.query.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }

    return null;
  }
}
