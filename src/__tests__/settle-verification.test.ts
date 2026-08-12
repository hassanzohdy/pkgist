import { afterEach, describe, expect, it, vi } from "vitest";
import * as registry from "../publish/registry.js";
import { settleVerification } from "../publish/npm-publisher.js";

/**
 * The post-publish read-back must tolerate registry propagation.
 *
 * Caught in production on the first real release after the read-back shipped:
 * `npm publish` succeeded, the immediate `npm view` said the version did not
 * exist, and the run was reported INCOMPLETE with exit 1 — while the version
 * was on npm seconds later. A false alarm here is expensive precisely because
 * it is indistinguishable from the real defect the check exists to catch.
 */
const noWait = () => Promise.resolve();

afterEach(() => {
  vi.restoreAllMocks();
});

function answers(...states: registry.RegistryState[]) {
  const queue = [...states];
  return vi
    .spyOn(registry, "queryPublishedVersion")
    .mockImplementation(async () => ({ state: queue.shift() ?? "absent" }));
}

describe("settleVerification", () => {
  it("returns immediately when the registry already serves the version", async () => {
    const spy = answers("present");

    const answer = await settleVerification("@scope/pkg", "1.0.0", 5, [1], noWait);

    expect(answer.state).toBe("present");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("keeps checking while the version has not propagated yet", async () => {
    // The exact production sequence: absent, absent, then present.
    const spy = answers("absent", "absent", "present");

    const answer = await settleVerification("@scope/pkg", "1.0.0", 5, [1], noWait);

    expect(answer.state).toBe("present");
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("retries an unreachable registry too — right after a publish it may just be slow", async () => {
    const spy = answers("unknown", "present");

    const answer = await settleVerification("@scope/pkg", "1.0.0", 5, [1], noWait);

    expect(answer.state).toBe("present");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("is bounded — a version that never arrives still fails", async () => {
    const spy = answers("absent", "absent", "absent", "absent", "absent");

    const answer = await settleVerification("@scope/pkg", "1.0.0", 5, [1], noWait);

    expect(answer.state).toBe("absent");
    expect(spy).toHaveBeenCalledTimes(5);
  });

  it("reports the last unresolved answer rather than claiming success", async () => {
    answers("unknown", "unknown", "unknown");

    const answer = await settleVerification("@scope/pkg", "1.0.0", 3, [1], noWait);

    expect(answer.state).toBe("unknown");
  });

  it("checks exactly once when only one attempt is allowed", async () => {
    const spy = answers("absent");

    await settleVerification("@scope/pkg", "1.0.0", 1, [1], noWait);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("backs off progressively between attempts", async () => {
    answers("absent", "absent", "absent", "present");
    const waited: number[] = [];

    await settleVerification("@scope/pkg", "1.0.0", 5, [10, 20, 30], async ms => {
      waited.push(ms);
    });

    expect(waited).toEqual([10, 20, 30]);
  });
});
