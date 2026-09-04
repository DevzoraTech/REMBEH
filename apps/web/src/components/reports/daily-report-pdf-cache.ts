"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildDailyReconciliationPdfBlob,
  dailyReportPdfFingerprint,
} from "./daily-report-pdf-document";
import type { DailyReportDocumentModel } from "./daily-reconciliation-report";

const memoryCache = new Map<string, Blob>();

export async function getOrBuildDailyReportPdf(
  document: DailyReportDocumentModel,
): Promise<Blob> {
  const key = dailyReportPdfFingerprint(document);
  const cached = memoryCache.get(key);
  if (cached) return cached;
  const blob = await buildDailyReconciliationPdfBlob(document);
  memoryCache.set(key, blob);
  // Cap memory cache size.
  if (memoryCache.size > 12) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
  return blob;
}

export function useDailyReportPdf(document: DailyReportDocumentModel) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const fingerprint = dailyReportPdfFingerprint(document);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const next = await getOrBuildDailyReportPdf(document);
        if (cancelled) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const objectUrl = URL.createObjectURL(next);
        urlRef.current = objectUrl;
        setBlob(next);
        setUrl(objectUrl);
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not prepare this PDF report.",
        );
        setBlob(null);
        setUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Fingerprint captures content identity; avoid regenerating on referential churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, []);

  return { blob, url, loading, error };
}
