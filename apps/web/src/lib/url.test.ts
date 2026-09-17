import { describe, expect, it } from "vitest";
import { buildHref, firstParam, parsePage } from "./url";

describe("url helpers", () => {
  it("builds hrefs preserving and patching params", () => {
    expect(buildHref("/admin/empresas", { q: "gorila", status: "ACTIVE" }, { page: 2 })).toBe(
      "/admin/empresas?q=gorila&status=ACTIVE&page=2",
    );
    expect(buildHref("/admin/empresas", { q: "gorila", page: "3" }, { page: undefined, q: "" })).toBe(
      "/admin/empresas",
    );
  });

  it("parses pages defensively", () => {
    expect(parsePage("4")).toBe(4);
    expect(parsePage(["2", "9"])).toBe(2);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("99999999")).toBe(10000);
    expect(firstParam(undefined)).toBeUndefined();
  });
});
