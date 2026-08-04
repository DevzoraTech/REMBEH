"use client";

import { Suspense } from "react";
import { AgentsWorkspace } from "../../components/agents/agents-workspace";
import { AppBootSkeleton } from "../../components/app/skeleton";

export default function AgentsPage() {
  return (
    <Suspense fallback={<AppBootSkeleton />}>
      <AgentsWorkspace />
    </Suspense>
  );
}
