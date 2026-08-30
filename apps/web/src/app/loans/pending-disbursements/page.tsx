"use client";

import { LoansWorkspace } from "../../../components/loans/loans-workspace";

export default function PendingDisbursementsPage() {
  return <LoansWorkspace mode="manager" view="pending-disbursements" />;
}
