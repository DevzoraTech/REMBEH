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
      status: 'CURRENT',
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
      collectionsReceived: 0,
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
      collectionsReceived: 0,
      loans: [
        {
          id: 'legacy-closed',
          customerId: 'legacy-client',
          status: 'CLOSED',
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

  it('does not revive a closed imported loan when archived payments are incomplete', () => {
    const service = Object.create(
      OperationsService.prototype,
    ) as OperationsService;
    const calculate = (
      service as unknown as {
        buildPortfolioPerformance: (input: unknown) => {
          activeBorrowers: number;
          borrowersDue: number;
          borrowersMissed: number;
          borrowersWithAdvance: number;
          principalDisbursed: number;
          principalRepaid: number;
          principalOutstanding: number;
          interestExpected: number;
          interestCollected: number;
          interestOutstanding: number;
        };
      }
    ).buildPortfolioPerformance.bind(service);
    const day = new Date(2026, 8, 23, 12);

    const result = calculate({
      dayStart: new Date(2026, 8, 23),
      dayEnd: new Date(2026, 8, 23, 23, 59, 59, 999),
      operationDate: day,
      collectionsReceived: 0,
      loans: [
        {
          id: 'coglim-closed-incomplete-history',
          customerId: 'closed-client',
          status: 'CLOSED',
          principal: 100_000,
          balance: 0,
          disbursedAt: new Date(2025, 0, 1),
          paymentStartDate: new Date(2025, 0, 2),
          createdAt: new Date(2025, 0, 1),
          application: null,
          wallet: { openingBalance: 120_000 },
          disbursements: [
            { amount: 100_000, disbursedAt: new Date(2025, 0, 1) },
          ],
          repayments: [
            {
              amount: 20_000,
              principalAllocated: 0,
              interestAllocated: 20_000,
              paidAt: new Date(2025, 0, 10),
            },
          ],
        },
      ],
    });

    expect(result.activeBorrowers).toBe(0);
    expect(result.borrowersDue).toBe(0);
    expect(result.borrowersMissed).toBe(0);
    expect(result.borrowersWithAdvance).toBe(0);
    expect(result.principalDisbursed).toBe(100_000);
    expect(result.principalRepaid).toBe(100_000);
    expect(result.principalOutstanding).toBe(0);
    expect(result.interestExpected).toBe(20_000);
    expect(result.interestCollected).toBe(20_000);
    expect(result.interestOutstanding).toBe(0);
  });

  it('does not subtract archived Coglim payments from the imported balance twice', () => {
    const service = Object.create(
      OperationsService.prototype,
    ) as OperationsService;
    const calculate = (
      service as unknown as {
        buildPortfolioPerformance: (input: unknown) => {
          activeBorrowers: number;
          principalOutstanding: number;
        };
      }
    ).buildPortfolioPerformance.bind(service);
    const day = new Date(2026, 8, 25);
    const result = calculate({
      dayStart: day,
      dayEnd: new Date(2026, 8, 25, 23, 59, 59, 999),
      operationDate: day,
      collectionsReceived: 0,
      loans: [
        {
          id: 'coglim-active',
          customerId: 'coglim-client',
          status: 'CURRENT',
          principal: 1_000_000,
          balance: 1_080_000,
          disbursedAt: new Date(2026, 7, 1),
          paymentStartDate: new Date(2026, 7, 2),
          createdAt: new Date(2026, 7, 1),
          application: {
            principalAmount: 1_000_000,
            interestRatePercent: 20,
            durationDays: 30,
            processingFee: 0,
            repaymentFrequency: 'DAILY',
            localId: 'coglim-app-eki-1',
          },
          wallet: { openingBalance: 1_200_000 },
          disbursements: [
            { amount: 1_000_000, disbursedAt: new Date(2026, 7, 1) },
          ],
          repayments: [{ amount: 1_280_000, paidAt: new Date(2026, 8, 20) }],
        },
      ],
    });

    expect(result.activeBorrowers).toBe(1);
    expect(result.principalOutstanding).toBe(1_000_000);
  });

  it('applies advance to specific days and expires it when only a partial day remains', () => {
    const service = Object.create(
      OperationsService.prototype,
    ) as OperationsService;
    const calculate = (
      service as unknown as {
        buildPortfolioPerformance: (input: unknown) => {
          borrowersDue: number;
          borrowersPaid: number;
          borrowersMissed: number;
          borrowersWithAdvance: number;
          totalAdvanceAmount: number;
          totalDue: number;
          totalRepaid: number;
          totalStillDue: number;
        };
      }
    ).buildPortfolioPerformance.bind(service);
    const start = new Date(2026, 8, 1);
    const loan = {
      id: 'advance-loan',
      customerId: 'advance-client',
      status: 'CURRENT',
      principal: 100_000,
      balance: 65_000,
      disbursedAt: start,
      paymentStartDate: start,
      createdAt: start,
      application: {
        principalAmount: 100_000,
        interestRatePercent: 0,
        durationDays: 10,
        processingFee: 0,
        repaymentFrequency: 'DAILY',
      },
      wallet: { openingBalance: 100_000 },
      disbursements: [{ amount: 100_000, disbursedAt: start }],
      repayments: [
        {
          amount: 35_000,
          principalAllocated: 35_000,
          interestAllocated: 0,
          paidAt: new Date(2026, 8, 1, 10),
        },
      ],
    };

    const receiptDay = calculate({
      loans: [loan],
      dayStart: new Date(2026, 8, 1),
      dayEnd: new Date(2026, 8, 1, 23, 59, 59, 999),
      operationDate: new Date(2026, 8, 1),
      collectionsReceived: 35_000,
    });
    expect(receiptDay.totalRepaid).toBe(35_000);

    const coveredDay = calculate({
      loans: [loan],
      dayStart: new Date(2026, 8, 2),
      dayEnd: new Date(2026, 8, 2, 23, 59, 59, 999),
      operationDate: new Date(2026, 8, 2),
      collectionsReceived: 0,
    });
    expect(coveredDay).toMatchObject({
      borrowersDue: 1,
      borrowersPaid: 1,
      borrowersMissed: 0,
      borrowersWithAdvance: 1,
      totalAdvanceAmount: 15_000,
      totalDue: 10_000,
      totalRepaid: 0,
      totalStillDue: 0,
    });

    const partialDay = calculate({
      loans: [loan],
      dayStart: new Date(2026, 8, 4),
      dayEnd: new Date(2026, 8, 4, 23, 59, 59, 999),
      operationDate: new Date(2026, 8, 4),
      collectionsReceived: 0,
    });
    expect(partialDay).toMatchObject({
      borrowersDue: 1,
      borrowersPaid: 0,
      borrowersMissed: 1,
      borrowersWithAdvance: 0,
      totalAdvanceAmount: 0,
      totalDue: 10_000,
      totalRepaid: 0,
      totalStillDue: 5_000,
    });
  });

  it('counts only loans closed during the selected business day', () => {
    const service = Object.create(
      OperationsService.prototype,
    ) as OperationsService;
    const calculate = (
      service as unknown as {
        buildPortfolioPerformance: (input: unknown) => {
          closedLoans: number;
          closedLoansAmount: number;
        };
      }
    ).buildPortfolioPerformance.bind(service);
    const dayStart = new Date(2026, 8, 28);
    const dayEnd = new Date(2026, 8, 28, 23, 59, 59, 999);
    const loan = (id: string, paidAt: Date) => ({
      id,
      customerId: id,
      status: 'CLOSED',
      principal: 100_000,
      balance: 0,
      disbursedAt: new Date(2026, 8, 1),
      paymentStartDate: new Date(2026, 8, 1),
      createdAt: new Date(2026, 8, 1),
      application: {
        principalAmount: 100_000,
        interestRatePercent: 0,
        durationDays: 30,
        processingFee: 0,
        repaymentFrequency: 'DAILY',
      },
      wallet: { openingBalance: 100_000 },
      disbursements: [{ amount: 100_000, disbursedAt: new Date(2026, 8, 1) }],
      repayments: [{ amount: 100_000, paidAt }],
    });

    const result = calculate({
      loans: [
        loan('closed-today', new Date(2026, 8, 28, 11)),
        loan('closed-earlier', new Date(2026, 8, 20, 11)),
      ],
      dayStart,
      dayEnd,
      operationDate: dayStart,
      collectionsReceived: 100_000,
    });

    expect(result.closedLoans).toBe(1);
    expect(result.closedLoansAmount).toBe(100_000);
  });

  it('excludes 60-day defaulters from active borrowers', () => {
    const service = Object.create(
      OperationsService.prototype,
    ) as OperationsService;
    const calculate = (
      service as unknown as {
        buildPortfolioPerformance: (input: unknown) => {
          activeBorrowers: number;
          borrowersMissed: number;
        };
      }
    ).buildPortfolioPerformance.bind(service);
    const reportDay = new Date(2026, 8, 29);
    const result = calculate({
      loans: [
        {
          id: 'defaulted-loan',
          customerId: 'defaulted-borrower',
          status: 'IN_ARREARS',
          principal: 100_000,
          balance: 100_000,
          disbursedAt: new Date(2026, 5, 1),
          paymentStartDate: new Date(2026, 5, 1),
          createdAt: new Date(2026, 5, 1),
          application: {
            principalAmount: 100_000,
            interestRatePercent: 0,
            durationDays: 30,
            processingFee: 0,
            repaymentFrequency: 'DAILY',
          },
          wallet: { openingBalance: 100_000 },
          disbursements: [
            { amount: 100_000, disbursedAt: new Date(2026, 5, 1) },
          ],
          repayments: [],
        },
      ],
      dayStart: reportDay,
      dayEnd: new Date(2026, 8, 29, 23, 59, 59, 999),
      operationDate: reportDay,
      collectionsReceived: 0,
    });

    expect(result.activeBorrowers).toBe(0);
    expect(result.borrowersMissed).toBe(1);
  });
});
