declare module "lru-cache" {
  export class LRUCache<K = unknown, V = unknown> {
    constructor(options?: any);
    get(key: K): V | undefined;
    set(key: K, value: V, options?: { ttl?: number; sizeCalculation?: (value: V, key: K) => number }): void;
  }
}

declare module "p-limit" {
  type LimitFunction = <T>(fn: () => Promise<T>) => Promise<T>;
  function pLimit(concurrency: number): LimitFunction;
  export default pLimit;
}

declare module "undici" {
  export const fetch: typeof globalThis.fetch;
}
