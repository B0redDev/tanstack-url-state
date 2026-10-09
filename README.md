# @netaddictionsrl/tanstack-search-state

URL search params as React state for [TanStack Router](https://tanstack.com/router), in the style of [nuqs](https://nuqs.dev). The route's own `validateSearch` is the parser, so every key is typed once, links stay type-safe, and there is no second set of parsers to keep in sync.

```sh
bun add @netaddictionsrl/tanstack-search-state
```

Peer dependencies: `@tanstack/react-router` ^1.170, `react` ≥ 18, `zod` ^4.

## Declare the params on the route

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { searchParams } from "@netaddictionsrl/tanstack-search-state";
import { z } from "zod";

export const Route = createFileRoute("/settings")({
  ...searchParams({
    section: z.enum(["models", "services"]).default("models").catch("models"),
    q: z.string().optional().catch(undefined),
  }),
  component: SettingsRoute,
});
```

`searchParams` returns `validateSearch` plus a middleware that keeps values equal to their default out of the URL (`/settings`, not `/settings?section=models`). Every key must be optional or have a `.default()`; `.catch()` turns a hand-edited bad value into the fallback instead of an error.

## Read and write

```tsx
import { useSearchState, useSearchStates } from "@netaddictionsrl/tanstack-search-state";

function SettingsRoute() {
  const [section, setSection] = useSearchState(Route, "section");
  const [filters, setFilters] = useSearchStates(Route, ["q", "section"]);

  setSection("services");
  setFilters({ q: "rome" }, { debounce: 300 });
  setFilters((prev) => ({ q: prev.q ? null : "rome" }));
}
```

- **Optimistic:** every hook reading a key sees the new value at once, before the URL changes.
- **Batched:** updates in the same tick (or inside a `debounce` window) become one navigation.
- **Removal:** `null`, `undefined`, `""` and `[]` remove the key, which then reads as its default.
- **Setters return a promise** that resolves once the URL holds the update.

Options, per hook or per call:

| Option | Default | Effect |
| --- | --- | --- |
| `history` | `"replace"` | `"push"` adds a history entry: use it for real navigation steps. |
| `scroll` | `false` | Scroll to the top after the update. |
| `debounce` | `0` | Milliseconds to wait before writing the URL; the state updates immediately. |

`searchDefaults(schema)` returns the defaulted keys of a zod object schema, if you need them elsewhere.

## License

MIT
