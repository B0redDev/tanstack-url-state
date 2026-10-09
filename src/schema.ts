// zod-only building blocks; no router or React import, so they bundle on their own.
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

export interface PaginationOptions {
  /** Default page size, kept out of the URL; default 20. */
  perPage?: number;
  /** Largest page size a URL may ask for; default 100. */
  maxPerPage?: number;
}

/**
 * `page` (1-based) and `perPage` for a list route: spread into `searchParams({ ... })`.
 * Both have defaults (so they stay out of the URL) and fall back to them on junk input.
 */
export function pagination({ perPage = 20, maxPerPage = 100 }: PaginationOptions = {}) {
  return {
    page: z.number().int().positive().default(1).catch(1),
    perPage: z.number().int().min(1).max(maxPerPage).default(perPage).catch(perPage),
  };
}

/** `field` and `-field` for every field, whichever form `sorts` lists them in. */
export type SortValue<S extends string> = S extends `-${infer F}` ? S | F : S | `-${S}`;

/**
 * `sort=field` / `sort=-field` (descending). Unknown fields fall back to `fallback`, or to no
 * sort when there is none. `sorts` may list bare fields, signed ones, or both.
 */
export function sortParam<const S extends string>(
  sorts: readonly S[],
): z.ZodCatch<z.ZodOptional<z.ZodEnum<{ [K in SortValue<S>]: K }>>>;
export function sortParam<const S extends string>(
  sorts: readonly S[],
  fallback: SortValue<S>,
): z.ZodCatch<z.ZodDefault<z.ZodEnum<{ [K in SortValue<S>]: K }>>>;
export function sortParam(sorts: readonly string[], fallback?: string) {
  const fields = [...new Set(sorts.map((sort) => sort.replace(/^-/, "")))];
  const sort = z.enum(fields.flatMap((field) => [field, `-${field}`]) as [string, ...string[]]);
  return fallback === undefined
    ? sort.optional().catch(undefined)
    : sort.default(fallback).catch(fallback);
}
