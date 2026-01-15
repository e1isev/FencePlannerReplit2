export function makeLoopGuard(label: string, limit = 25) {
  let count = 0;
  let last = performance.now();

  return function guard() {
    const now = performance.now();
    if (now - last > 100) {
      count = 0;
      last = now;
    }
    count++;
    if (count > limit) {
      console.error(`[loop-guard] ${label} exceeded ${limit} calls in ~100ms`);
    }
  };
}
