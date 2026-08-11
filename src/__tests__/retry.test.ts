import { describe, expect, it, vi } from "vitest";
import { backoffFor, isRetryableError, withRetry } from "../utils/retry.js";

const noSleep = () => Promise.resolve();

describe("isRetryableError — network-class failures", () => {
  const retryable = [
    "npm error code ETIMEDOUT",
    "npm error network request to https://registry.npmjs.org/@warlock.js%2fcascade failed",
    "read ECONNRESET",
    "getaddrinfo EAI_AGAIN registry.npmjs.org",
    "connect ECONNREFUSED 104.16.0.1:443",
    "socket hang up",
    "kex_exchange_identification: Connection closed by remote host",
    "fatal: the remote end hung up unexpectedly",
    "ssh: connect to host github.com port 22: Connection timed out",
    "error: RPC failed; curl 56 recv failure",
  ];

  for (const message of retryable) {
    it(`retries: ${message.slice(0, 48)}`, () => {
      expect(isRetryableError(new Error(message))).toBe(true);
    });
  }
});

describe("isRetryableError — failures that must never be retried", () => {
  /**
   * Retrying into a rate limit makes it worse, and retrying a duplicate
   * publish only produces a second, more confusing failure — "version already
   * exists" usually means the previous attempt actually succeeded.
   */
  const never = [
    "npm error code E409",
    "npm error code EPUBLISHCONFLICT",
    "You cannot publish over the previously published versions: 1.2.3",
    "npm error code E403",
    "npm error code E404 Not Found - PUT",
    "npm error code ENEEDAUTH",
    "npm error code EOTP",
    "git@github.com: Permission denied (publickey).",
    "remote: Authentication failed for 'https://github.com/x/y'",
  ];

  for (const message of never) {
    it(`does not retry: ${message.slice(0, 48)}`, () => {
      expect(isRetryableError(new Error(message))).toBe(false);
    });
  }

  it("a never-retry pattern wins even when a network word is also present", () => {
    // A duplicate-version rejection that happens to mention a timeout must
    // still not be retried — the version is already there.
    expect(
      isRetryableError(new Error("npm error code E409 after ETIMEDOUT on a previous attempt")),
    ).toBe(false);
  });

  it("does not retry an unrecognised failure", () => {
    expect(isRetryableError(new Error("tsdown: entry file not found"))).toBe(false);
  });
});

describe("backoffFor — exponential, capped", () => {
  it("grows exponentially from the first retry", () => {
    expect(backoffFor(2)).toBe(1000);
    expect(backoffFor(3)).toBe(2000);
    expect(backoffFor(4)).toBe(4000);
  });

  it("never exceeds the cap", () => {
    expect(backoffFor(50)).toBe(15_000);
  });
});

describe("withRetry", () => {
  it("returns immediately on success, reporting a single attempt", async () => {
    const operation = vi.fn().mockResolvedValue("done");

    const result = await withRetry(operation, { label: "publish", packageName: "x", sleep: noSleep });

    expect(result).toEqual({ value: "done", attempts: 1 });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("recovers from a transient failure and reports the attempt count", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("npm error code ETIMEDOUT"))
      .mockResolvedValue("done");

    const result = await withRetry(operation, { label: "publish", packageName: "x", sleep: noSleep });

    expect(result).toEqual({ value: "done", attempts: 2 });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("is bounded — it does not hang on a permanently failing network op", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(
      withRetry(operation, { attempts: 4, label: "push", packageName: "x", sleep: noSleep }),
    ).rejects.toThrow("ETIMEDOUT");

    expect(operation).toHaveBeenCalledTimes(4);
  });

  it("surfaces the failure rather than swallowing it once attempts are exhausted", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("ECONNRESET while pushing"));

    await expect(
      withRetry(operation, { attempts: 2, label: "push", packageName: "x", sleep: noSleep }),
    ).rejects.toThrow("ECONNRESET while pushing");
  });

  it("fails fast on a non-retryable error — no second attempt", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("npm error code E409"));

    await expect(
      withRetry(operation, { attempts: 5, label: "publish", packageName: "x", sleep: noSleep }),
    ).rejects.toThrow("E409");

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("treats attempts below 1 as a single attempt", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(
      withRetry(operation, { attempts: 0, label: "push", packageName: "x", sleep: noSleep }),
    ).rejects.toThrow();

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
