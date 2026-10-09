import { stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { searchDefaults } from "./schema.js";

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
