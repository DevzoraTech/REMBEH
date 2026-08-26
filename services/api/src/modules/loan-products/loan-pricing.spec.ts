import {
  computeLoanPricing,
  resolveBaseRepayable,
} from './loan-pricing';

describe('computeLoanPricing', () => {
  it(
    'computes flat percent interest and total repayable without duration factor',
    () => {
      const result = computeLoanPricing({
        principalAmount: 100_000,
        interestRatePercent: 12,
        durationDays: 90,
        processingFee: 0,
      });

      expect(
        result.interestAmount,
      ).toBe(12_000);

      expect(
        result.totalRepayable,
      ).toBe(112_000);

      expect(
        result.durationDays,
      ).toBe(90);
    },
  );

  it(
    'keeps processing fee separate from total repayable',
    () => {
      const result = computeLoanPricing({
        principalAmount: 1_000_000,
        interestRatePercent: 12,
        durationDays: 30,
        processingFee: 10_000,
      });

      expect(
        result.interestAmount,
      ).toBe(120_000);

      /*
       * Borrower debt:
       * 1,000,000 principal
       * + 120,000 interest
       * = 1,120,000
       *
       * Processing fee is separate income.
       */
      expect(
        result.totalRepayable,
      ).toBe(1_120_000);

      expect(
        result.processingFee,
      ).toBe(10_000);
    },
  );

  it(
    'processing fee does not change borrower debt',
    () => {
      const withoutFee =
        computeLoanPricing({
          principalAmount: 1_000_000,
          interestRatePercent: 12,
          durationDays: 30,
          processingFee: 0,
        });

      const withFee =
        computeLoanPricing({
          principalAmount: 1_000_000,
          interestRatePercent: 12,
          durationDays: 30,
          processingFee: 50_000,
        });

      expect(
        withFee.totalRepayable,
      ).toBe(
        withoutFee.totalRepayable,
      );

      expect(
        withFee.processingFee,
      ).toBe(50_000);
    },
  );

  it(
    'ignores duration when computing interim flat interest',
    () => {
      const short =
        computeLoanPricing({
          principalAmount: 50_000,
          interestRatePercent: 10,
          durationDays: 7,
        });

      const long =
        computeLoanPricing({
          principalAmount: 50_000,
          interestRatePercent: 10,
          durationDays: 365,
        });

      expect(
        short.interestAmount,
      ).toBe(5_000);

      expect(
        long.interestAmount,
      ).toBe(5_000);

      expect(
        short.totalRepayable,
      ).toBe(
        long.totalRepayable,
      );
    },
  );

  it(
    'uses flat interim preview for reducing/compound types',
    () => {
      const flat =
        computeLoanPricing({
          principalAmount: 100_000,
          interestRatePercent: 12,
          durationDays: 30,
          interestType: 'FLAT',
        });

      const reducing =
        computeLoanPricing({
          principalAmount: 100_000,
          interestRatePercent: 12,
          durationDays: 30,
          interestType:
            'REDUCING_BALANCE',
        });

      const compound =
        computeLoanPricing({
          principalAmount: 100_000,
          interestRatePercent: 12,
          durationDays: 30,
          interestType:
            'COMPOUND',
        });

      expect(
        reducing.interestAmount,
      ).toBe(
        flat.interestAmount,
      );

      expect(
        compound.interestAmount,
      ).toBe(
        flat.interestAmount,
      );

      expect(
        reducing.totalRepayable,
      ).toBe(
        flat.totalRepayable,
      );

      expect(
        compound.totalRepayable,
      ).toBe(
        flat.totalRepayable,
      );
    },
  );
});

describe(
  'resolveBaseRepayable',
  () => {
    it(
      'keeps wallet opening that already matches contractual pricing',
      () => {
        expect(
          resolveBaseRepayable({
            openingBalance:
              1_120_000,
            pricedTotal:
              1_120_000,
            principal:
              1_000_000,
          }),
        ).toBe(
          1_120_000,
        );
      },
    );

    it(
      'replaces principal-only opening with contractual pricing',
      () => {
        expect(
          resolveBaseRepayable({
            openingBalance:
              2_500_000,
            pricedTotal:
              2_900_000,
            principal:
              2_500_000,
          }),
        ).toBe(
          2_900_000,
        );
      },
    );

    it(
      'replaces legacy annualized opening with flat contractual pricing',
      () => {
        expect(
          resolveBaseRepayable({
            openingBalance:
              4_560_879.45,
            pricedTotal:
              5_040_000,
            principal:
              4_500_000,
          }),
        ).toBe(
          5_040_000,
        );
      },
    );
  },
);