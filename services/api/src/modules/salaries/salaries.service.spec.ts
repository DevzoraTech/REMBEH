import { SalariesService } from './salaries.service';

describe('SalariesService employee cycles', () => {
  const service = new SalariesService({} as never, {} as never);

  const resolveEmployeeCycle = (joined: string, cycleStart?: string) =>
    (
      service as unknown as {
        resolveEmployeeCycle: (
          dateJoined: string,
          start?: string,
        ) => { startDate: Date; endDate: Date; nextStart: Date };
      }
    ).resolveEmployeeCycle(joined, cycleStart);

  it('anchors a cycle to the employee date joined', () => {
    const cycle = resolveEmployeeCycle('2026-01-10', '2026-09-10');

    expect(cycle.startDate.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(cycle.endDate.toISOString()).toBe('2026-10-09T00:00:00.000Z');
    expect(cycle.nextStart.toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });

  it('clamps month-end anniversaries without restoring a shared cycle', () => {
    const februaryCycle = resolveEmployeeCycle('2026-01-31', '2026-02-28');

    expect(februaryCycle.startDate.toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
    expect(februaryCycle.endDate.toISOString()).toBe(
      '2026-03-30T00:00:00.000Z',
    );
    expect(februaryCycle.nextStart.toISOString()).toBe(
      '2026-03-31T00:00:00.000Z',
    );
  });
});
