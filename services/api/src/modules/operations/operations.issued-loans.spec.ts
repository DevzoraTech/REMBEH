import { LoanApplicationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OperationsRepository } from './operations.repository';

describe('issued loan report queries', () => {
  const input = {
    tenantId: 'tenant',
    branchId: 'branch',
    dayStart: new Date('2026-10-26T00:00:00.000Z'),
    dayEnd: new Date('2026-10-26T23:59:59.999Z'),
  };

  it('excludes submitted applications without a posted loan', async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { principalAmount: null, processingFee: null },
      _count: { _all: 0 },
    });
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      loanApplication: { aggregate, findMany },
    } as unknown as PrismaService;
    const repository = new OperationsRepository(prisma);

    await repository.sumLoansIssued(input);
    await repository.listLoansIssuedToday(input);

    for (const query of [aggregate.mock.calls[0][0], findMany.mock.calls[0][0]]) {
      expect(query.where).toMatchObject({
        status: LoanApplicationStatus.SUBMITTED,
        loanId: { not: null },
        isOpeningMigration: false,
      });
    }
  });
});
