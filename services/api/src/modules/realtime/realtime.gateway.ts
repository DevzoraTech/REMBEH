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
import { resolveAuthStatusBlock } from '../../common/auth/user-status-access';
import { Server, Socket } from 'socket.io';
import { JwtTokenService } from '../../common/auth/jwt-token.service';
import { PrismaService } from '../../database/prisma.service';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import type {
  LoanApplicationRealtimePayload,
  PaymentRealtimePayload,
} from './realtime.events';

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
        resolveAuthStatusBlock(user)
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
      await this.joinScopedRooms(client, socketUser);

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

    // Only allow re-joining the caller's own branch room (tenant-prefixed).
    if (body?.branchId && user.branchId === body.branchId) {
      await client.join(this.branchRoom(user.tenantId, body.branchId));
    }

    return {
      ok: true,
      rooms: {
        tenant: this.canSeeAllBranches(user)
          ? this.tenantRoom(user.tenantId)
          : null,
        branch: user.branchId
          ? this.branchRoom(user.tenantId, user.branchId)
          : null,
      },
    };
  }

  emitToTenant(tenantId: string, event: string, payload: unknown) {
    this.server.to(this.tenantRoom(tenantId)).emit(event, payload);
  }

  emitToBranch(tenantId: string, branchId: string, event: string, payload: unknown) {
    this.server.to(this.branchRoom(tenantId, branchId)).emit(event, payload);
  }

  broadcastLoanApplication(
    event: string,
    payload: LoanApplicationRealtimePayload,
  ) {
    this.emitToTenant(payload.tenantId, event, payload);
    this.emitToBranch(payload.tenantId, payload.branchId, event, payload);
  }

  broadcastPayment(event: string, payload: PaymentRealtimePayload) {
    this.emitToTenant(payload.tenantId, event, payload);
    this.emitToBranch(payload.tenantId, payload.branchId, event, payload);
  }

  private async joinScopedRooms(client: Socket, user: SocketUser) {
    // Owners (branch.create) hear tenant-wide events.
    // Agents / branch managers only join their tenant+branch room.
    if (this.canSeeAllBranches(user)) {
      await client.join(this.tenantRoom(user.tenantId));
    }
    if (user.branchId) {
      await client.join(this.branchRoom(user.tenantId, user.branchId));
    }
  }

  private canSeeAllBranches(user: SocketUser) {
    return user.permissions.includes(BRANCH_PERMISSIONS.create);
  }

  private tenantRoom(tenantId: string) {
    return `tenant:${tenantId}`;
  }

  /** Branch rooms are tenant-prefixed to prevent any cross-tenant join. */
  private branchRoom(tenantId: string, branchId: string) {
    return `tenant:${tenantId}:branch:${branchId}`;
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
