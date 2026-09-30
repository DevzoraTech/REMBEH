#!/usr/bin/env node

require("reflect-metadata");
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../services/api/dist/src/app.module");
const {
  OperationsService,
} = require("../services/api/dist/src/modules/operations/operations.service");

async function main() {
  const force = process.argv.includes("--force");
  const branchArg = process.argv.find((value) => value.startsWith("--branch-id="));
  const branchId = branchArg ? branchArg.slice("--branch-id=".length) : null;
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const service = app.get(OperationsService);
    const repository = service.repository;
    const reports = await repository.prisma.branchOperationReport.findMany({
      where: branchId ? { branchId } : undefined,
      select: { id: true, tenantId: true, snapshot: true },
      orderBy: { operationDate: "asc" },
    });
    let refreshed = 0;
    const results = [];
    for (const row of reports) {
      const version = Number(row.snapshot?.version || 0);
      if (!force && version >= 14) continue;
      const report = await repository.findReportById({
        tenantId: row.tenantId,
        reportId: row.id,
      });
      if (!report) continue;
      const bounds = service.parseDayBounds(
        service.formatDateLabel(report.operationDate),
      );
      const contract = await service.toContract(
        report.operation,
        bounds.dayStart,
        bounds.dayEnd,
      );
      const snapshot = service.buildReportSnapshot(contract);
      await repository.updateReportSnapshot({
        tenantId: row.tenantId,
        reportId: row.id,
        snapshot,
      });
      refreshed += 1;
      results.push({
        reportId: row.id,
        reportNumber: report.reportNumber,
        branch: report.operation.branch.name,
        date: service.formatDateLabel(report.operationDate),
        activeBorrowers: contract.portfolioPerformance.activeBorrowers,
        borrowersDue: contract.portfolioPerformance.borrowersDue,
        borrowersMissed: contract.portfolioPerformance.borrowersMissed,
      });
    }
    console.log(JSON.stringify({ refreshed, reports: results }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
