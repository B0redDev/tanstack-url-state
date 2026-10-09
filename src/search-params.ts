import { stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";

const defaultsCache = new WeakMap<object, Record<string, unknown>>();

/** Values a route search schema falls back to when a key is missing from the URL. */
export function searchDefaults(schema: unknown): Record<string, unknown> {
  if (!(schema instanceof z.ZodObject)) {
    return {};
  }
  let defaults = defaultsCache.get(schema);
  if (!defaults) {
    // zod 4 `.partial()` keeps `.default()`s, so this yields exactly the defaulted keys.
    defaults = Object.fromEntries(
      Object.entries(schema.partial().parse({})).filter(([, value]) => value !== undefined),
    );
    defaultsCache.set(schema, defaults);
  }
  return defaults;
}

/**
 * Route search options from a zod shape: `validateSearch` (parsing + types) and a middleware
 * that drops values equal to their default from the URL. Spread into `createFileRoute(...)({ ... })`.
 * Every key must be optional or defaulted. Bad URL values should `.catch()` to a fallback.
 */
export function searchParams<T extends z.core.$ZodLooseShape>(shape: T) {
  const schema = z.object(shape);
  return {
    validateSearch: schema,
    search: {
      middlewares: [stripSearchParams<z.output<typeof schema>>(searchDefaults(schema) as never)],
    },
  };
}
