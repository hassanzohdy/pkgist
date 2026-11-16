import { describe, expect, it } from "vitest";
import { resolveSourcemap } from "../compile/sourcemap";

describe("resolveSourcemap", () => {
  it("emits maps with sources by default and for `true`", () => {
    expect(resolveSourcemap(undefined)).toEqual({ emit: true, excludeSources: false });
    expect(resolveSourcemap(true)).toEqual({ emit: true, excludeSources: false });
  });

  it("emits nothing for `false`", () => {
    expect(resolveSourcemap(false)).toEqual({ emit: false, excludeSources: false });
  });

  it("leaves the sources out for `{ excludeSources: true }`", () => {
    expect(resolveSourcemap({ excludeSources: true })).toEqual({ emit: true, excludeSources: true });
  });

  it("keeps the sources for `{}` and `{ excludeSources: false }`", () => {
    expect(resolveSourcemap({})).toEqual({ emit: true, excludeSources: false });
    expect(resolveSourcemap({ excludeSources: false })).toEqual({ emit: true, excludeSources: false });
  });
});
