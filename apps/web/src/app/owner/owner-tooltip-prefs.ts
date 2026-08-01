"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "rembeh.owner.tooltipsEnabled";

type Listener = (enabled: boolean) => void;

const listeners = new Set<Listener>();
let currentEnabled = true;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    currentEnabled = value == null ? true : value !== "0" && value !== "false";
  } catch {
    currentEnabled = true;
  }
}

export function readTooltipsEnabled(): boolean {
  hydrate();
  return currentEnabled;
}

export function writeTooltipsEnabled(enabled: boolean) {
  hydrate();
  currentEnabled = enabled;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }
  listeners.forEach((listener) => listener(enabled));
}

export function useTooltipsEnabled() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    hydrate();
    setEnabled(currentEnabled);

    const listener: Listener = (next) => setEnabled(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  function setTooltipsEnabled(next: boolean) {
    writeTooltipsEnabled(next);
  }

  return { enabled, setTooltipsEnabled };
}
