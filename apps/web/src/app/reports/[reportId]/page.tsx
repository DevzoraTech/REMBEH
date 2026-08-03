"use client";

import { use } from "react";
import { ReportDetailPage } from "../../../components/reports/report-detail-page";

export default function ManagerReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = use(params);
  return <ReportDetailPage mode="manager" reportId={reportId} />;
}
