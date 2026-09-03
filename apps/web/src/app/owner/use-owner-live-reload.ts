"use client";

import { useEffect } from "react";
import { LIVE_QUERY_REVALIDATE_EVENT } from "../../lib/live-query-cache";

export type OwnerReloadOptions = {
  silent?: boolean;
};

export function useOwnerLiveReload(
  reload: (options?: OwnerReloadOptions) => unknown,
  ready: boolean,
) {
  useEffect(() => {
    if (!ready) return;

    function refresh() {
      void reload({ silent: true });
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }

    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(LIVE_QUERY_REVALIDATE_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(LIVE_QUERY_REVALIDATE_EVENT, refresh);
    };
  }, [ready, reload]);
}
