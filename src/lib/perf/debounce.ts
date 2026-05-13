/**
 * Perf helpers — debounce/throttle micro-utilities.
 *
 * No deps. Used by ResizeObserver listeners and rAF-throttled handlers
 * that need predictable, jank-free behavior.
 */

/**
 * Trailing-edge debounce. Returns a function that delays invoking `fn` until
 * `wait` ms have passed since the last call. Includes a `.cancel()` method.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  wait: number,
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: unknown[]) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}

/**
 * rAF-coalesced throttle. Multiple calls within the same frame collapse
 * into a single trailing-edge invocation. Caps execution to ~60fps in
 * environments where rAF runs at vsync.
 */
export function rafThrottle<T extends (...args: unknown[]) => void>(fn: T): T & { cancel: () => void } {
  let scheduled = false;
  let lastArgs: unknown[] | null = null;
  let raf = 0;
  const wrapped = ((...args: unknown[]) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    raf = requestAnimationFrame(() => {
      scheduled = false;
      const a = lastArgs ?? [];
      lastArgs = null;
      fn(...a);
    });
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    scheduled = false;
    lastArgs = null;
    cancelAnimationFrame(raf);
  };
  return wrapped;
}
