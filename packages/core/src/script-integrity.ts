export const REPLACEMENT_CHAR = "�";

const MAX_DEPTH = 16;

function walk(value: unknown, path: string, depth: number, hits: string[]): void {
  if (depth > MAX_DEPTH) return;

  if (typeof value === "string") {
    if (value.includes(REPLACEMENT_CHAR)) hits.push(path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(item, path === "" ? String(index) : `${path}.${index}`, depth + 1, hits);
    });
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walk(item, path === "" ? key : `${path}.${key}`, depth + 1, hits);
    }
  }
}

export function damagedTextPaths(input: unknown): string[] {
  const hits: string[] = [];
  walk(input, "", 0, hits);
  return hits.sort();
}

export function damagedCharCount(input: unknown): number {
  const paths = damagedTextPaths(input);
  if (paths.length === 0) return 0;

  let total = 0;
  const count = (value: unknown): void => {
    if (typeof value === "string") {
      for (const ch of value) if (ch === REPLACEMENT_CHAR) total += 1;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(count);
      return;
    }
    if (value !== null && typeof value === "object") Object.values(value).forEach(count);
  };
  count(input);
  return total;
}
