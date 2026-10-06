import { OperationsService } from './operations.service';

describe('daily report snapshot', () => {
  it('uses the latest reconciliation cash count after a returned report is corrected', () => {
    const service = Object.create(
      OperationsService.prototype,
    ) as OperationsService;
    const buildSnapshot = (
      service as unknown as {
        buildReportSnapshot: (operation: Record<string, unknown>) => {
          summary: { countedCash: number; variance: number };
          cashPosition: { countedCash: number; variance: number };
        };
      }
    ).buildReportSnapshot.bind(service);

    const snapshot = buildSnapshot({
      expectedClosingBalance: 1_000_000,
      closingBalance: 280_000,
      closingVariance: -720_000,
      reconciliationCountedCash: 1_000_000,
    });

    expect(snapshot.summary.countedCash).toBe(1_000_000);
    expect(snapshot.summary.variance).toBe(0);
    expect(snapshot.cashPosition.countedCash).toBe(1_000_000);
    expect(snapshot.cashPosition.variance).toBe(0);
  });
});
