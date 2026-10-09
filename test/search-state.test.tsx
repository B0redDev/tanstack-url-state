import { afterEach, describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { z } from "zod";

import { searchDefaults, searchParams, useSearchState, useSearchStates } from "../src/index.js";

const shape = {
  tab: z.enum(["models", "services"]).default("models").catch("models"),
  q: z.string().optional().catch(undefined),
};

describe("searchDefaults", () => {
  test("returns only the defaulted keys, which the strip middleware drops from the URL", () => {
    expect(searchDefaults(z.object({ ...shape, page: z.number().default(1) }))).toEqual({ tab: "models", page: 1 });
    expect(searchDefaults(undefined)).toEqual({});
  });
});

function setup(initialUrl = "/") {
  const seen: { values?: { tab: "models" | "services"; q?: string }; tab?: string } = {};
  const actions: {
    set?: ReturnType<typeof useSearchStates<typeof route, "tab" | "q">>[1];
    setTab?: ReturnType<typeof useSearchState<typeof route, "tab">>[1];
  } = {};
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    ...searchParams(shape),
    component: function View() {
      const [values, set] = useSearchStates(route, ["tab", "q"]);
      const [tab, setTab] = useSearchState(route, "tab");
      seen.values = values;
      seen.tab = tab;
      actions.set = set;
      actions.setTab = setTab;
      return null;
    },
  });
  const history = createMemoryHistory({ initialEntries: [initialUrl] });
  const router = createRouter({ routeTree: rootRoute.addChildren([route]), history });
  return { router, history, seen, actions };
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

async function mount(context: ReturnType<typeof setup>) {
  root = createRoot(document.createElement("div"));
  await act(async () => {
    await context.router.load();
    root?.render(<RouterProvider router={context.router} />);
  });
}

describe("useSearchStates", () => {
  test("reads defaults and URL values through the route schema, falling back on bad input", async () => {
    const context = setup("/?tab=nope&q=hello");
    await mount(context);
    expect(context.seen.values).toEqual({ tab: "models", q: "hello" });
  });

  test("merges updates made in the same tick into one navigation and shows them before it lands", async () => {
    const context = setup();
    await mount(context);
    const before = context.history.length;
    let flushed: Promise<void> | undefined;
    act(() => {
      flushed = context.actions.set?.({ tab: "services" }, { history: "push" });
      context.actions.set?.({ q: "rome" }, { history: "push" });
    });
    expect(context.seen.values).toEqual({ tab: "services", q: "rome" });
    expect(context.router.state.location.search).toEqual({});
    await act(async () => {
      await flushed;
    });
    expect(context.history.length).toBe(before + 1);
    expect(context.router.state.location.search).toEqual({ tab: "services", q: "rome" });
  });

  test("keeps defaults out of the URL and removes keys set to null or an empty string", async () => {
    const context = setup("/?tab=services&q=rome");
    await mount(context);
    await act(async () => {
      await context.actions.set?.({ tab: "models", q: "" });
    });
    expect(context.router.state.location.href).toBe("/");
    expect(context.seen.values).toEqual({ tab: "models" });
    await act(async () => {
      await context.actions.setTab?.("services");
    });
    await act(async () => {
      await context.actions.setTab?.(null);
    });
    expect(context.router.state.location.href).toBe("/");
    expect(context.seen.tab).toBe("models");
  });

  test("debounced updates change the state at once and the URL only when the window ends", async () => {
    const context = setup();
    await mount(context);
    let flushed: Promise<void> | undefined;
    act(() => {
      flushed = context.actions.set?.({ q: "r" }, { debounce: 30 });
    });
    act(() => {
      context.actions.set?.({ q: "ro" }, { debounce: 30 });
    });
    expect(context.seen.values?.q).toBe("ro");
    expect(context.router.state.location.search).toEqual({});
    await act(async () => {
      await flushed;
    });
    expect(context.router.state.location.search).toEqual({ q: "ro" });
  });
});
