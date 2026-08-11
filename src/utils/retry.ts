import { logger } from "./logger.js";

/**
 * Bounded retry with exponential backoff for network-class failures.
 *
 * Every failure in the 2026-08-11 incident was transient — the same push and
 * the same publish succeeded minutes later with nothing changed. But an
 * unbounded retry is the wrong answer: if the cause is a rate limit, retrying
 * into the thing throttling you makes it worse. So: a small number of
 * attempts, exponential backoff, and the failure surfaced when they run out.
 * A retry must never turn a hard failure into a quiet one.
 */

/** Default attempts, including the first. 3 = one try plus two retries. */
export const DEFAULT_ATTEMPTS = 3;

/** Base backoff. Attempt n waits BASE * 2^(n-1): 1s, 2s, 4s… */
const BASE_DELAY_MS = 1000;

/** Never wait longer than this between attempts. */
const MAX_DELAY_MS = 15_000;

/**
 * Failures worth retrying: transport-level problems that say nothing about
 * whether the request was valid.
 */
const RETRYABLE_PATTERNS: RegExp[] = [
  /\bETIMEDOUT\b/i,
  /\bESOCKETTIMEDOUT\b/i,
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /\bEAI_AGAIN\b/i,
  /\bENOTFOUND\b/i,
  /\bEPIPE\b/i,
  /\bENETUNREACH\b/i,
  /\bEHOSTUNREACH\b/i,
  /network (?:request|error|timeout)/i,
  /socket hang up/i,
  /request to .* failed/i,
  // git-over-SSH transport failures
  /kex_exchange_identification/i,
  /Connection (?:closed|reset) by .*port/i,
  /Connection timed out/i,
  /ssh: connect to host/i,
  /early EOF/i,
  /RPC failed/i,
  /The remote end hung up unexpectedly/i,
  /unexpected disconnect/i,
];

/**
 * Failures that must NEVER be retried, checked before the retryable patterns.
 *
 * `E409` / `EPUBLISHCONFLICT` matters most: "version already exists" usually
 * means a previous attempt actually succeeded, so retrying can only produce a
 * confusing second failure. The idempotence check in the builder is what
 * should handle that case, not a retry.
 *
 * Auth and permission errors are equally pointless to repeat — the second
 * attempt has exactly the same credentials as the first.
 */
const NEVER_RETRY_PATTERNS: RegExp[] = [
  /\bE409\b/,
  /\bEPUBLISHCONFLICT\b/,
  /cannot publish over the previously published version/i,
  /\bE403\b/,
  /\bE404\b/,
  /\bENEEDAUTH\b/,
  /\bEOTP\b/,
  /\bEPRIVATE\b/,
  /403 Forbidden/,
  /401 Unauthorized/,
  /Permission denied \(publickey\)/i,
  /Authentication failed/i,
];

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Whether this failure is transport-class and therefore worth another attempt. */
export function isRetryableError(error: unknown): boolean {
  const message = messageOf(error);

  if (NEVER_RETRY_PATTERNS.some(pattern => pattern.test(message))) return false;

  return RETRYABLE_PATTERNS.some(pattern => pattern.test(message));
}

/** Backoff for the wait BEFORE the given attempt number (2 = first retry). */
export function backoffFor(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** (attempt - 2), MAX_DELAY_MS);
}

export interface RetryOptions {
  /** Total attempts including the first. Values below 1 are treated as 1. */
  attempts?: number;
  /** Shown in the retry log line, e.g. "push" or "publish". */
  label: string;
  packageName: string;
  /** Injected in tests so the suite does not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RetryResult<T> {
  value: T;
  /** Attempts actually made. Greater than 1 means a retry happened. */
  attempts: number;
}

const realSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Run `operation`, retrying only network-class failures.
 *
 * Rethrows the LAST error once attempts are exhausted, or immediately for any
 * failure that is not retryable — the caller sees a normal failure either way.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<RetryResult<T>> {
  const total = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const sleep = options.sleep ?? realSleep;

  let lastError: unknown;

  for (let attempt = 1; attempt <= total; attempt++) {
    try {
      const value = await operation();
      if (attempt > 1) {
        logger.success(
          `[retry] ${options.packageName}: ${options.label} succeeded on attempt ${attempt}/${total}`,
        );
      }
      return { value, attempts: attempt };
    } catch (err) {
      lastError = err;

      const isLast = attempt === total;
      if (isLast || !isRetryableError(err)) break;

      const delay = backoffFor(attempt + 1);
      logger.warn(
        `[retry] ${options.packageName}: ${options.label} failed (attempt ${attempt}/${total}) — ` +
          `retrying in ${Math.round(delay / 1000)}s: ${messageOf(err).split("\n")[0]}`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
