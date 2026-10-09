import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each export must bundle with only the peers it needs: a schema-only import pulls no router or
// React, the hooks never pull the strip middleware, and so on.
const INDEX = join(import.meta.dir, "../src/index.ts");
const PEERS = ["react", "react-dom", "@tanstack/react-router", "zod"];

async function bundle(names: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "tanstack-url-state-"));
  try {
    const entry = join(dir, "entry.ts");
    await Bun.write(entry, `export { ${names.join(", ")} } from ${JSON.stringify(INDEX)};`);
    const result = await Bun.build({ entrypoints: [entry], external: PEERS, target: "browser" });
    expect(result.success).toBe(true);
    return await result.outputs[0]!.text();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const imports = (code: string) =>
  [...new Set([...code.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]))].sort();

describe("tree-shaking", () => {
  test("schema helpers depend on zod alone", async () => {
    const code = await bundle(["pagination", "sortParam", "searchDefaults"]);
    expect(imports(code)).toEqual(["zod"]);
  });

  test("searchParams adds the router's strip middleware, not React", async () => {
    const code = await bundle(["searchParams"]);
    expect(imports(code)).toEqual(["@tanstack/react-router", "zod"]);
    expect(code).not.toContain("useSyncExternalStore");
  });

  test("the hooks leave the route helpers out", async () => {
    const code = await bundle(["useSearchState", "useSearchStates"]);
    expect(code).not.toContain("stripSearchParams");
    expect(code).not.toContain("sortParam");
    expect(code).not.toContain("pagination");
  });
});
