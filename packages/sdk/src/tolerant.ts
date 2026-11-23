import { z } from "zod";

const CHILD_KEYS = ["innerType", "element", "in", "out", "left", "right", "keyType", "valueType", "rest"] as const;
const LIST_KEYS = ["options", "items"] as const;
const loosened = new WeakMap<z.ZodType, z.ZodType>();
const visiting = new WeakSet<z.ZodType>();

const isSchema = (value: unknown): value is z.ZodType => typeof value === "object" && value !== null && "_zod" in value;
const field = (value: unknown): PropertyDescriptor => ({ value, enumerable: true, writable: true, configurable: true });

export function tolerant<S extends z.ZodType>(schema: S): S {
  const known = loosened.get(schema);
  if (known !== undefined) return known as S;
  if (visiting.has(schema)) return schema;
  visiting.add(schema);
  const def = schema.def as unknown as Record<string, unknown>;
  const changes: PropertyDescriptorMap = {};
  if (def.type === "object") {
    const shape = def.shape as Record<string, z.ZodType>;
    const next = Object.fromEntries(Object.entries(shape).map(([key, child]) => [key, tolerant(child)]));
    if (Object.keys(shape).some((key) => next[key] !== shape[key])) changes.shape = field(next);
    if (isSchema(def.catchall) && def.catchall.def.type === "never") changes.catchall = field(z.unknown());
  }
  for (const key of CHILD_KEYS) {
    const child = def[key];
    if (isSchema(child) && tolerant(child) !== child) changes[key] = field(tolerant(child));
  }
  for (const key of LIST_KEYS) {
    const list = def[key];
    if (!Array.isArray(list)) continue;
    const next = list.map((child: unknown) => (isSchema(child) ? tolerant(child) : child));
    if (next.some((child, index) => child !== list[index])) changes[key] = field(next);
  }
  if (def.type === "lazy" && typeof def.getter === "function") {
    const getter = def.getter as () => z.ZodType;
    changes.getter = field(() => tolerant(getter()));
    changes._cachedInner = field(undefined);
  }
  visiting.delete(schema);
  const result = Object.keys(changes).length === 0 ? schema
    : schema.clone(Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(def), ...changes }) as S["def"]) as S;
  loosened.set(schema, result);
  return result;
}
