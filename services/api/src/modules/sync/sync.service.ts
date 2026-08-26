import {
  Injectable,
  Logger,
  OnModuleInit,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { OperationDto } from './dto/upload-queue.dto';
import { SYNC_PERMISSIONS } from './sync.permissions';

export interface ProcessedOperation {
  localId: string;
  serverId: string;
  status: 'success' | 'duplicate';
}

export interface ConflictedOperation {
  localId: string;
  reason: string;
  message: string;
  serverData?: any;
}

export interface FailedOperation {
  localId: string;
  error: string;
  message: string;
}

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureMobileSyncPermissions();
    } catch (error) {
      this.logger.warn(
        `Sync permission bootstrap skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async ensureMobileSyncPermissions() {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true },
    });

    const syncPermissionDefinitions = [
      {
        key: SYNC_PERMISSIONS.download,
        description: 'Sync: Download snapshot data for offline use',
      },
      {
        key: SYNC_PERMISSIONS.upload,
        description: 'Sync: Upload pending operations from offline queue',
      },
    ];

    const mobileRoleNames = [
      'Account Owner',
      'Owner',
      'Workspace Owner',
      'Branch Manager',
      'Manager',
      'Supervisor',
      'Cashier',
      'Agent',
      'Field Agent',
      'Field Officer',
      'Loan Officer',
      'Recovery Officer',
    ];

    for (const tenant of tenants) {
      const permissions = await Promise.all(
        syncPermissionDefinitions.map((permission) =>
          this.prisma.permission.upsert({
            where: {
              tenantId_key: {
                tenantId: tenant.id,
                key: permission.key,
              },
            },
            create: {
              tenantId: tenant.id,
              key: permission.key,
              moduleKey: 'sync',
              description: permission.description,
            },
            update: {},
            select: { id: true },
          }),
        ),
      );

      const roles = await this.prisma.role.findMany({
        where: {
          tenantId: tenant.id,
          name: { in: mobileRoleNames },
        },
        select: { id: true },
      });

      for (const role of roles) {
        for (const permission of permissions) {
          await this.prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: permission.id,
              },
            },
            create: {
              roleId: role.id,
              permissionId: permission.id,
            },
            update: {},
          });
        }
      }
    }
  }

  /**
   * Generate a mobile snapshot. Branch staff receive their branch; owners who
   * are not assigned to a branch receive the tenant-wide manager/owner copy.
   */
  async generateSnapshot(user: AuthenticatedUser, lastSyncAt?: string) {
    const { tenantId, branchId } = user;
    const tenantWide =
      !branchId &&
      (user.permissions.includes('branch.create') ||
        user.permissions.includes('billing.manage'));

    if (!branchId && !tenantWide) {
      throw new BadRequestException('Branch ID is required for sync');
    }

    const lastSyncDate = lastSyncAt ? new Date(lastSyncAt) : undefined;
    const isIncremental = !!lastSyncDate;
    const branchWhere = branchId ? { branchId } : {};
    const branchInfoWhere = branchId ? { id: branchId } : {};
    const agentBranchWhere = branchId
      ? { branchId }
      : { branchId: { not: null } };

    this.logger.log(
      `Generating ${isIncremental ? 'incremental' : 'full'} snapshot for tenant=${tenantId} branch=${branchId ?? 'ALL'} user=${user.userId}`,
    );

    // Build where clause for incremental sync
    const incrementalWhere = lastSyncDate
      ? { updatedAt: { gte: lastSyncDate } }
      : {};

    // Fetch all data scoped to tenant + branch
    const [customers, loans, loanProducts, agents, branches, repayments] =
      await Promise.all([
        // Customers in this branch
        this.prisma.customer.findMany({
          where: {
            tenantId,
            ...branchWhere,
            ...incrementalWhere,
          },
          select: {
            id: true,
            tenantId: true,
            branchId: true,
            nationalId: true,
            fullName: true,
            phone: true,
            email: true,
            verifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),

        // Active and overdue loans in this branch
        this.prisma.loan.findMany({
          where: {
            tenantId,
            ...branchWhere,
            status: { in: ['CURRENT', 'IN_ARREARS', 'DISBURSED'] },
            ...incrementalWhere,
          },
          select: {
            id: true,
            tenantId: true,
            branchId: true,
            customerId: true,
            principal: true,
            balance: true,
            currency: true,
            status: true,
            disbursedAt: true,
            paymentStartDate: true,
            isFined: true,
            finesTotal: true,
            createdAt: true,
            updatedAt: true,
            application: {
              select: {
                loanProductTemplateId: true,
                interestRatePercent: true,
                durationDays: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        }),

        // All active loan product templates (not branch-scoped)
        this.prisma.loanProductTemplate.findMany({
          where: {
            tenantId,
            isActive: true,
            ...incrementalWhere,
          },
          select: {
            id: true,
            tenantId: true,
            name: true,
            interestRatePercent: true,
            interestType: true,
            termValue: true,
            termUnit: true,
            repaymentFrequency: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        }),

        // Agents in this branch
        this.prisma.user.findMany({
          where: {
            tenantId,
            ...agentBranchWhere,
            status: 'ACTIVE',
            ...incrementalWhere,
          },
          select: {
            id: true,
            tenantId: true,
            branchId: true,
            displayName: true,
            phone: true,
            email: true,
            createdAt: true,
            updatedAt: true,
            roles: {
              select: {
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        }),

        // Branch info
        this.prisma.branch.findMany({
          where: {
            tenantId,
            ...branchInfoWhere,
          },
          select: {
            id: true,
            tenantId: true,
            name: true,
            address: true,
            phone: true,
            createdAt: true,
            updatedAt: true,
          },
        }),

        // Recent repayments/collections (last 30 days)
        // Note: Mobile app splits these into 'collections' and 'payments' locally
        this.prisma.repayment.findMany({
          where: {
            tenantId,
            ...branchWhere,
            paidAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
            ...incrementalWhere,
          },
          select: {
            id: true,
            tenantId: true,
            branchId: true,
            recordedByUserId: true,
            loanId: true,
            amount: true,
            principalAllocated: true,
            interestAllocated: true,
            feesAllocated: true,
            method: true,
            paidAt: true,
            note: true,
            receiptNumber: true,
            createdAt: true,
            updatedAt: true,
            loan: {
              select: {
                customerId: true,
              },
            },
          },
          orderBy: { paidAt: 'desc' },
          take: 500,
        }),
      ]);

    // Transform agents to include role
    const agentsFormatted = agents.map((agent) => ({
      id: agent.id,
      tenantId: agent.tenantId,
      branchId: agent.branchId,
      displayName: agent.displayName,
      phone: agent.phone,
      email: agent.email,
      role: agent.roles[0]?.role.name || 'AGENT',
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    }));

    // Format repayments with customerId extracted from loan relation
    const repaymentsFormatted = repayments.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      branchId: r.branchId,
      agentId: r.recordedByUserId,
      loanId: r.loanId,
      customerId: r.loan.customerId,
      amount: r.amount,
      principalAllocated: r.principalAllocated,
      interestAllocated: r.interestAllocated,
      feesAllocated: r.feesAllocated,
      method: r.method,
      paidAt: r.paidAt,
      note: r.note,
      receiptNumber: r.receiptNumber,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const snapshot = {
      version: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      isIncremental,
      data: {
        customers,
        loans,
        loanProducts,
        agents: agentsFormatted,
        branches,
        repayments: repaymentsFormatted,
      },
      deletedIds: isIncremental
        ? await this.getDeletedRecordsSince(
            tenantId,
            branchId ?? null,
            lastSyncDate!,
          )
        : {},
    };

    this.logger.log(
      `Snapshot generated: ${customers.length} customers, ${loans.length} loans, ${loanProducts.length} products`,
    );

    return snapshot;
  }

  /**
   * Get IDs of records deleted since last sync
   * This requires a soft-delete tracking table (future enhancement)
   */
  private async getDeletedRecordsSince(
    tenantId: string,
    branchId: string | null,
    since: Date,
  ) {
    // TODO: Implement soft delete tracking
    // For now, return empty object
    return {
      customers: [],
      loans: [],
    };
  }

  /**
   * Process operation queue uploaded from mobile app
   */
  async processOperationQueue(
    user: AuthenticatedUser,
    operations: OperationDto[],
  ): Promise<{
    processed: ProcessedOperation[];
    conflicts: ConflictedOperation[];
    errors: FailedOperation[];
  }> {
    const processed: ProcessedOperation[] = [];
    const conflicts: ConflictedOperation[] = [];
    const errors: FailedOperation[] = [];

    this.logger.log(
      `Processing ${operations.length} operations for user=${user.userId}`,
    );

    for (const operation of operations) {
      try {
        // Check for duplicate submission
        const existing = await this.checkDuplicateOperation(operation.localId);
        if (existing) {
          processed.push({
            localId: operation.localId,
            serverId: existing.id,
            status: 'duplicate',
          });
          continue;
        }

        // Process operation based on type
        const result = await this.processOperation(user, operation);

        processed.push({
          localId: operation.localId,
          serverId: result.id,
          status: 'success',
        });
      } catch (error) {
        if (error instanceof ConflictException) {
          conflicts.push({
            localId: operation.localId,
            reason: error.message,
            message: error.message,
            serverData: (error as any).details,
          });
        } else {
          errors.push({
            localId: operation.localId,
            error: error instanceof Error ? error.name : 'UnknownError',
            message:
              error instanceof Error ? error.message : 'Unknown error occurred',
          });
        }
      }
    }

    this.logger.log(
      `Operation queue processed: ${processed.length} successful, ${conflicts.length} conflicts, ${errors.length} errors`,
    );

    return { processed, conflicts, errors };
  }

  /**
   * Check if operation with localId was already processed
   */
  private async checkDuplicateOperation(
    localId: string,
  ): Promise<{ id: string } | null> {
    // Check loan applications
    const loanApp = await this.prisma.loanApplication.findFirst({
      where: { localId },
      select: { id: true },
    });
    if (loanApp) return loanApp;

    // Check repayments (handles both collections and payments from mobile)
    const repayment = await this.prisma.repayment.findFirst({
      where: { localId },
      select: { id: true },
    });
    if (repayment) return repayment;

    return null;
  }

  /**
   * Process individual operation based on type
   */
  private async processOperation(
    user: AuthenticatedUser,
    operation: OperationDto,
  ): Promise<{ id: string }> {
    const { tenantId, branchId, userId } = user;

    switch (operation.type) {
      case 'LOAN_APPLICATION_CREATE':
        return await this.createLoanApplication(
          tenantId,
          branchId!,
          userId,
          operation.localId,
          operation.payload,
        );

      case 'COLLECTION_CREATE':
      case 'PAYMENT_CREATE':
        // Both mobile 'collections' and 'payments' map to server Repayment model
        return await this.createRepayment(
          tenantId,
          branchId!,
          userId,
          operation.localId,
          operation.payload,
        );

      default:
        throw new BadRequestException(
          `Unknown operation type: ${operation.type}`,
        );
    }
  }

  /**
   * Create loan application from sync operation
   */
  private async createLoanApplication(
    tenantId: string,
    branchId: string,
    agentId: string,
    localId: string,
    payload: any,
  ) {
    // Check for duplicate NIN if provided
    if (payload.applicantNin) {
      const existingCustomer = await this.prisma.customer.findFirst({
        where: {
          tenantId,
          nationalId: payload.applicantNin,
        },
      });

      if (existingCustomer) {
        // Check for pending application for this customer
        const pendingApp = await this.prisma.loanApplication.findFirst({
          where: {
            tenantId,
            customerId: existingCustomer.id,
            status: { in: ['SUBMITTED'] },
          },
        });

        if (pendingApp) {
          throw new ConflictException(
            'Customer already has a pending loan application',
          );
        }
      }
    }

    // Create loan application
    const application = await this.prisma.loanApplication.create({
      data: {
        localId,
        tenantId,
        branchId,
        officerUserId: agentId,
        status: 'SUBMITTED',
        nationalId: payload.applicantNin,
        surname: payload.applicantLastName,
        givenNames: payload.applicantFirstName,
        phone: payload.applicantPhone,
        village: payload.applicantVillage,
        principalAmount: payload.requestedAmount,
        loanProductTemplateId: payload.loanProductId,
        submittedAt: new Date(),
      },
    });

    return { id: application.id };
  }

  /**
   * Create repayment from sync operation (handles both collections and payments from mobile)
   */
  private async createRepayment(
    tenantId: string,
    branchId: string,
    userId: string,
    localId: string,
    payload: any,
  ) {
    const amount = Number(payload.amount);

    // Simple allocation: fees first, then interest, then principal
    // TODO: Use proper allocation logic from CollectionsService
    const feesAllocated = 0;
    const interestAllocated = 0;
    const principalAllocated = amount;

    const repayment = await this.prisma.repayment.create({
      data: {
        localId,
        tenantId,
        branchId,
        loanId: payload.loanId,
        recordedByUserId: userId,
        amount,
        principalAllocated,
        interestAllocated,
        feesAllocated,
        method: payload.paymentMethod || payload.method || 'CASH',
        paidAt: new Date(
          payload.collectionDate || payload.paymentDate || payload.paidAt,
        ),
        note: payload.notes || payload.note,
        receiptNumber: payload.receiptNumber || payload.referenceNumber,
      },
    });

    // Update loan balance
    await this.updateLoanBalance(payload.loanId, amount);

    return { id: repayment.id };
  }

  /**
   * Update loan balance after repayment
   */
  private async updateLoanBalance(loanId: string, amount: number) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      select: { balance: true },
    });

    if (loan) {
      const newBalance = Number(loan.balance) - amount;
      await this.prisma.loan.update({
        where: { id: loanId },
        data: {
          balance: Math.max(0, newBalance),
        },
      });
    }
  }
}
