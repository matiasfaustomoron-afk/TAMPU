"use client";

import { useSyncExternalStore, useCallback, useState } from "react";

const emptySubscribe = () => () => {};

/**
 * Returns true only on the client after hydration.
 * Uses useSyncExternalStore to avoid the setMounted-in-useEffect lint error.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

/**
 * Forces a component re-render. Useful after mutations.
 */
export function useForceUpdate() {
  const [, setTick] = useState(0);
  return useCallback(() => setTick((t) => t + 1), []);
}
