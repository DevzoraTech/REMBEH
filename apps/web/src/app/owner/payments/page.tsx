"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppBootSkeleton } from "../../../components/app/skeleton";

/** Payments is Collections — keep one nav destination. */
export default function OwnerPaymentsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/owner/collections");
  }, [router]);

  return <AppBootSkeleton />;
}
