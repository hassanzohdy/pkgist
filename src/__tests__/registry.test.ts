import { describe, expect, it } from "vitest";
import { classifyRegistryResponse } from "../publish/registry.js";

/**
 * The three-state rule, as a decision table.
 *
 * The failure this guards against is specific: a hand-written sweep using
 * `git ls-remote | grep -q` reported "0 of 26 tags present" when the true
 * answer was "the network was unreachable", because an unreachable host and an
 * absent ref both produce no output. Any check that returns a boolean here is
 * wrong by construction.
 */
describe("classifyRegistryResponse — present", () => {
  it("an exact version match is the only thing that counts as present", () => {
    expect(classifyRegistryResponse(0, "1.3.1\n", "", "1.3.1")).toEqual({ state: "present" });
  });

  it("a different version is not a match for the one we asked about", () => {
    const answer = classifyRegistryResponse(0, "1.3.0\n", "", "1.3.1");
    expect(answer.state).toBe("unknown");
  });
});

describe("classifyRegistryResponse — absent", () => {
  it("exit 0 with no output means the registry answered and has no such version", () => {
    const answer = classifyRegistryResponse(0, "", "", "1.3.1");
    expect(answer.state).toBe("absent");
  });

  it("an E404 from the registry is a definitive absence", () => {
    const answer = classifyRegistryResponse(1, "", "npm error code E404\nnpm error 404 Not Found", "1.3.1");
    expect(answer.state).toBe("absent");
  });
});

describe("classifyRegistryResponse — COULD-NOT-ASK", () => {
  /**
   * These are the cases that must never be reported as `absent`. Doing so
   * would claim a publish failed when it may well have succeeded — and in a
   * lockstep family that claim would be acted on.
   */
  const unreachable = [
    "npm error code ETIMEDOUT",
    "npm error network request to https://registry.npmjs.org/@scope%2fpkg failed, reason: connect ETIMEDOUT",
    "npm error code ECONNRESET",
    "npm error code EAI_AGAIN",
    "npm error getaddrinfo ENOTFOUND registry.npmjs.org",
    "socket hang up",
  ];

  for (const stderr of unreachable) {
    it(`unreachable, not absent: ${stderr.slice(0, 46)}`, () => {
      const answer = classifyRegistryResponse(1, "", stderr, "1.3.1");
      expect(answer.state).toBe("unknown");
      expect(answer.detail).toMatch(/unreachable|could not/i);
    });
  }

  it("an unrecognised non-zero exit is unknown, never absent", () => {
    const answer = classifyRegistryResponse(1, "", "npm error something nobody has seen before", "1.3.1");
    expect(answer.state).toBe("unknown");
  });

  it("a missing exit code is unknown", () => {
    const answer = classifyRegistryResponse(undefined, "", "", "1.3.1");
    expect(answer.state).toBe("unknown");
  });

  it("never collapses unknown into absent for any input", () => {
    // The property that matters, stated directly: nothing that failed to reach
    // the registry may come back as a confident "not published".
    const failures = [...unreachable, "", "weird output"];
    for (const stderr of failures) {
      const answer = classifyRegistryResponse(1, "", stderr, "1.3.1");
      if (/E404|404 Not Found/.test(stderr)) continue;
      expect(answer.state).not.toBe("absent");
    }
  });
});
