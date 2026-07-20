"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** @deprecated Use `/settings` (loan products section). */
export default function LoanProductsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings?section=loan-products");
  }, [router]);

  return null;
}
