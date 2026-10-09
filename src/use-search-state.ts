import { useRouter, useSearch } from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { searchDefaults } from "./schema.js";

/**
 * nuqs-style URL state on top of TanStack Router: the route's `validateSearch` is the parser,
 * these hooks are `useQueryState`/`useQueryStates`.
 *
 * - Updates are optimistic: every hook reading a key sees the new value immediately.
 * - Updates in the same tick (or within a `debounce` window) are merged into one navigation.
 * - `null`, `undefined`, `""` and `[]` remove the key, so it reads as the schema default.
 * - Defaults are kept out of the URL by `searchParams()`' middleware.
 */

/** A file route (`Route`) whose `validateSearch` types the keys. */
export interface SearchRoute {
  id: string;
  options: { validateSearch?: unknown };
  types: { fullSearchSchema: object };
}
type SearchOf<R extends SearchRoute> = R["types"]["fullSearchSchema"];
type Patch<S, K extends keyof S> = { [P in K]?: S[P] | null };

export interface SearchStateOptions {
  /** `push` adds a history entry; default `replace`. */
  history?: "push" | "replace";
  /** Scroll to top after the update; default `false`. */
  scroll?: boolean;
  /** Delay the URL write (ms) while still updating state immediately; restarts on each update. */
  debounce?: number;
}

// One queue per app: search params are global to the URL. Only written by client events, never during SSR.
const EMPTY: Record<string, unknown> = {};
let pending = EMPTY;
let queued: { router: AnyRouter; push: boolean; scroll: boolean } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextFlush: Promise<void> | null = null;
let resolveFlush: (() => void) | undefined;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};
const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

async function flush() {
  timer = undefined;
  const sent = pending;
  const job = queued;
  const resolve = resolveFlush;
  queued = null;
  nextFlush = null;
  try {
    if (job) {
      const patch = Object.fromEntries(
        Object.entries(sent).map(([key, value]) => [key, isEmpty(value) ? undefined : value]),
      );
      await job.router.navigate({
        to: ".",
        replace: !job.push,
        resetScroll: job.scroll,
        search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
      } as never);
    }
  } finally {
    // The URL now owns what was sent; keep only values set again while navigating.
    const rest = Object.fromEntries(Object.entries(pending).filter(([key, value]) => sent[key] !== value));
    pending = Object.keys(rest).length > 0 ? rest : EMPTY;
    emit();
    resolve?.();
  }
}

function enqueue(router: AnyRouter, patch: Record<string, unknown>, options: SearchStateOptions) {
  pending = { ...pending, ...patch };
  queued = {
    router,
    push: queued?.push === true || options.history === "push",
    scroll: queued?.scroll === true || options.scroll === true,
  };
  nextFlush ??= new Promise<void>((resolve) => {
    resolveFlush = resolve;
  });
  emit();
  clearTimeout(timer);
  // An immediate update also writes any debounced one still waiting.
  timer = setTimeout(flush, options.debounce ?? 0);
  return nextFlush;
}

function pick(source: Record<string, unknown>, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) {
      out[key] = source[key];
    }
  }
  return out;
}

/** Pending removals read as the schema default, like a missing URL key. */
function withDefaults(values: Record<string, unknown>, defaults: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = isEmpty(value) ? defaults[key] : value;
  }
  return out;
}

/** Several search params as one state object; one navigation per update. */
export function useSearchStates<R extends SearchRoute, const K extends keyof SearchOf<R> & string>(
  route: R,
  keys: readonly K[],
  options: SearchStateOptions = {},
) {
  type S = SearchOf<R>;
  const router = useRouter();
  const defaults = searchDefaults(route.options.validateSearch);
  // Callers pass inline arrays; key the memos on the names, not the array identity.
  const keysKey = keys.join("\0");
  const stableKeys = useMemo(() => keysKey.split("\0") as K[], [keysKey]);

  // Re-renders only when one of these keys changes in the URL…
  const fromUrl = useSearch({
    strict: false,
    structuralSharing: true,
    select: (search: Record<string, unknown>) => pick(search, stableKeys),
  } as never) as Record<string, unknown>;

  // …or in the pending queue (only the keys that have a pending value).
  const lastPending = useRef(EMPTY);
  const pendingValues = useSyncExternalStore(
    subscribe,
    () => {
      const last = lastPending.current;
      const next = pick(pending, stableKeys);
      const names = Object.keys(next);
      const same =
        names.length === Object.keys(last).length && names.every((key) => key in last && last[key] === next[key]);
      if (!same) {
        lastPending.current = next;
      }
      return lastPending.current;
    },
    () => EMPTY,
  );

  const values = useMemo(
    () => ({ ...fromUrl, ...withDefaults(pendingValues, defaults) }) as Pick<S, K>,
    [fromUrl, pendingValues, defaults],
  );

  const { history, scroll, debounce } = options;
  const set = useCallback(
    (update: Patch<S, K> | ((prev: Pick<S, K>) => Patch<S, K>), callOptions?: SearchStateOptions) => {
      // Functional updates chain on values queued earlier in the same tick.
      const prev = { ...values, ...withDefaults(pick(pending, stableKeys), defaults) } as Pick<S, K>;
      return enqueue(router, typeof update === "function" ? update(prev) : update, {
        history,
        scroll,
        debounce,
        ...callOptions,
      });
    },
    [router, values, stableKeys, defaults, history, scroll, debounce],
  );

  return [values, set] as const;
}

/** One search param as `[value, setValue]`, like `useState`. */
export function useSearchState<R extends SearchRoute, const K extends keyof SearchOf<R> & string>(
  route: R,
  key: K,
  options?: SearchStateOptions,
) {
  type V = SearchOf<R>[K];
  const [values, setValues] = useSearchStates(route, [key], options);
  const set = useCallback(
    (update: V | null | ((prev: V) => V | null), callOptions?: SearchStateOptions) =>
      setValues(
        (prev) =>
          ({
            [key]: typeof update === "function" ? (update as (prev: V) => V | null)(prev[key]) : update,
          }) as never,
        callOptions,
      ),
    [key, setValues],
  );
  return [values[key], set] as const;
}
