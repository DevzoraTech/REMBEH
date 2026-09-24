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
          borrowersMissed: number;
          totalStillDue: number;
          missedRepaymentBuckets: Array<{
            key: string;
            borrowers: number;
            amount: number;
          }>;
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
    expect(result.borrowersMissed).toBe(1);
    expect(result.totalStillDue).toBe(22_000);
    expect(
      result.missedRepaymentBuckets.reduce(
        (sum, bucket) => sum + bucket.borrowers,
        0,
      ),
    ).toBe(result.borrowersMissed);
    expect(result.missedRepaymentBuckets[0]).toMatchObject({
      key: 'one_day',
      borrowers: 1,
      amount: 22_000,
    });
    expect(result.principalDisbursed).toBe(200_000);
    expect(result.principalOutstanding).toBe(200_000);
    expect(result.interestExpected).toBe(20_000);
    expect(result.interestOutstanding).toBe(20_000);
  });

  it('uses principal-first payment totals instead of unreliable legacy allocations', () => {
    const service = Object.create(
      OperationsService.prototype,
    ) as OperationsService;
    const calculate = (
      service as unknown as {
        buildPortfolioPerformance: (input: unknown) => {
          principalDisbursed: number;
          principalRepaid: number;
          principalOutstanding: number;
          activeBorrowers: number;
        };
      }
    ).buildPortfolioPerformance.bind(service);
    const day = new Date(2026, 8, 23, 12);
    const result = calculate({
      dayStart: new Date(2026, 8, 23),
      dayEnd: new Date(2026, 8, 23, 23, 59, 59, 999),
      operationDate: day,
      loans: [
        {
          id: 'legacy-closed',
          customerId: 'legacy-client',
          principal: 100_000,
          balance: 0,
          disbursedAt: new Date(2026, 7, 1),
          paymentStartDate: new Date(2026, 7, 1),
          createdAt: new Date(2026, 7, 1),
          application: {
            principalAmount: 100_000,
            interestRatePercent: 10,
            durationDays: 10,
            processingFee: 0,
            repaymentFrequency: 'DAILY',
            localId: 'buremba-legacy-0001',
          },
          wallet: { openingBalance: 110_000 },
          disbursements: [
            { amount: 100_000, disbursedAt: new Date(2026, 7, 1) },
          ],
          repayments: [
            {
              amount: 110_000,
              principalAllocated: 40_000,
              interestAllocated: 70_000,
              paidAt: new Date(2026, 7, 10),
            },
          ],
        },
      ],
    });

    expect(result.principalDisbursed).toBe(100_000);
    expect(result.principalRepaid).toBe(100_000);
    expect(result.principalOutstanding).toBe(0);
    expect(result.activeBorrowers).toBe(0);
  });
});
