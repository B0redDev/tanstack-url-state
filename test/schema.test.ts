import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { pagination, searchDefaults, sortParam } from "../src/index.js";

describe("sortParam", () => {
  test("accepts each field ascending and descending, whatever form the list uses", () => {
    const bare = sortParam(["name", "createdAt"]);
    const signed = sortParam(["title", "-title"]);
    expect(bare.parse("name")).toBe("name");
    expect(bare.parse("-createdAt")).toBe("-createdAt");
    expect(signed.parse("-title")).toBe("-title");
    expect(signed.parse("title")).toBe("title");
  });

  test("unknown or malformed values fall back instead of failing the route", () => {
    expect(sortParam(["name"]).parse("password")).toBeUndefined();
    expect(sortParam(["name"]).parse(["name"])).toBeUndefined();
    expect(sortParam(["publishDate"], "-publishDate").parse("--x")).toBe("-publishDate");
    expect(sortParam(["publishDate"], "-publishDate").parse(undefined)).toBe("-publishDate");
  });
});

describe("pagination", () => {
  test("defaults are what searchDefaults reports, so they stay out of the URL", () => {
    const schema = z.object({ ...pagination(), sort: sortParam(["name"], "name") });
    expect(searchDefaults(schema)).toEqual({ page: 1, perPage: 20, sort: "name" });
    expect(searchDefaults(z.object(pagination({ perPage: 50 })))).toEqual({ page: 1, perPage: 50 });
  });

  test("junk from hand-edited URLs falls back; the page size is capped", () => {
    const schema = z.object(pagination({ maxPerPage: 100 }));
    expect(schema.parse({ page: "abc", perPage: 1000 })).toEqual({ page: 1, perPage: 20 });
    expect(schema.parse({ page: 0, perPage: -5 })).toEqual({ page: 1, perPage: 20 });
    expect(schema.parse({ page: 3, perPage: 100 })).toEqual({ page: 3, perPage: 100 });
  });
});
