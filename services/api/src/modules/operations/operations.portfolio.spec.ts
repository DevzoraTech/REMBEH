import { OperationsService } from './operations.service';

describe('daily report portfolio performance', () => {
  it('counts distinct borrowers and excludes processing fees from portfolio debt', () => {
    const service = Object.create(
      OperationsService.prototype,
    ) as OperationsService;
    const calculate = (
      service as unknown as {
        buildPortfolioPerformance: (input: unknown) => {
          activeBorrowers: number;
          borrowersDue: number;
          principalDisbursed: number;
          principalOutstanding: number;
          interestExpected: number;
          interestOutstanding: number;
        };
      }
    ).buildPortfolioPerformance.bind(service);
    const dayStart = new Date(2026, 8, 22, 0, 0, 0, 0);
    const dayEnd = new Date(2026, 8, 22, 23, 59, 59, 999);
    const loan = (id: string) => ({
      id,
      customerId: 'same-borrower',
      principal: 100_000,
      balance: 110_000,
      disbursedAt: dayStart,
      paymentStartDate: dayStart,
      createdAt: dayStart,
      application: {
        principalAmount: 100_000,
        interestRatePercent: 10,
        durationDays: 10,
        processingFee: 5_000,
        repaymentFrequency: 'DAILY',
      },
      wallet: { openingBalance: 110_000 },
      disbursements: [{ amount: 100_000, disbursedAt: dayStart }],
      repayments: [],
    });

    const result = calculate({
      loans: [loan('loan-1'), loan('loan-2')],
      dayStart,
      dayEnd,
      operationDate: dayStart,
    });

    expect(result.activeBorrowers).toBe(1);
    expect(result.borrowersDue).toBe(1);
    expect(result.principalDisbursed).toBe(200_000);
    expect(result.principalOutstanding).toBe(200_000);
    expect(result.interestExpected).toBe(20_000);
    expect(result.interestOutstanding).toBe(20_000);
  });
});
