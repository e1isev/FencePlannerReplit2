type PublicFieldTarget = Record<PropertyKey, unknown>;

const globalTarget = globalThis as Record<string, unknown>;

if (typeof globalTarget.__publicField !== "function") {
  globalTarget.__publicField = (
    target: PublicFieldTarget,
    key: PropertyKey,
    value: unknown
  ) => {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      configurable: true,
    });
    return value;
  };
}
