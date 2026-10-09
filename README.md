# tanstack-url-state

URL search params as React state for [TanStack Router](https://tanstack.com/router), in the style of [nuqs](https://nuqs.dev). The route's own `validateSearch` is the parser, so every key is typed once, links stay type-safe, and there is no second set of parsers to keep in sync.

```sh
bun add tanstack-url-state
```

Peer dependencies: `@tanstack/react-router` ^1.170, `react` ≥ 18, `zod` ^4.

## Declare the params on the route

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { searchParams } from "tanstack-url-state";
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
import { useSearchState, useSearchStates } from "tanstack-url-state";

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

## Lists: pagination and sort

```tsx
import { pagination, searchParams, sortParam } from "tanstack-url-state";

export const Route = createFileRoute("/videos")({
  ...searchParams({
    ...pagination(), // page (default 1), perPage (default 20, at most 100)
    sort: sortParam(["title", "publishDate"], "-publishDate"), // "title" | "-title" | …
  }),
});
```

- `pagination({ perPage, maxPerPage })` gives `page` and `perPage` with defaults (kept out of the URL) and a fallback for junk such as `?page=abc`.
- `sortParam(sorts, fallback?)` accepts `field` and `-field` (descending) for every field in `sorts`, which may list bare or signed names; anything else reads as `fallback`, or as no sort.

`searchDefaults(schema)` returns the defaulted keys of a zod object schema, if you need them elsewhere.

## Bundle size

ESM only, one module per concern, `"sideEffects": false`: you ship what you import. The schema helpers (`pagination`, `sortParam`, `searchDefaults`) need only `zod`; `searchParams` adds the router's `stripSearchParams`; the hooks need React and the router and never pull the route helpers. A test bundles each group to keep it that way.

## License

MIT
