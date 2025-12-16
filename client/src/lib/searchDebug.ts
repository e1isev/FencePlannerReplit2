const env =
  (typeof import.meta !== "undefined" && (import.meta as any).env) ||
  (typeof process !== "undefined" ? process.env : {});

export function isDebugSearch(): boolean {
  const flag = env?.VITE_DEBUG_SEARCH;
  return flag === "true" || flag === "1";
}
