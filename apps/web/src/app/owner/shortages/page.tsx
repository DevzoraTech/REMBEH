"use client";

import { Suspense } from "react";
import { AppBootSkeleton } from "../../../components/app/skeleton";
import { ShortagesWorkspace } from "../../../components/shortages/shortages-workspace";

export default function OwnerShortagesPage() {
  return (
    <Suspense fallback={<AppBootSkeleton />}>
      <ShortagesWorkspace mode="owner" />
    </Suspense>
  );
}
