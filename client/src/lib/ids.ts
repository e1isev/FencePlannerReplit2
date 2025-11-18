let counter = 0;

export function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${counter++}`;
}
