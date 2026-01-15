export function makeLoopGuard(label: string, windowMs = 200, limit = 20) {
  let count = 0;
  let t0 = performance.now();

  return function guard() {
    const now = performance.now();
    if (now - t0 > windowMs) {
      t0 = now;
      count = 0;
    }
    count++;
    if (count > limit) {
      console.warn(`[loop-guard] ${label}: ${count} calls in ${windowMs}ms`);
    }
  };
}
