/** Base error class for all bundler errors. Carries a step name for structured logging. */
export class BundlerError extends Error {
  constructor(
    public readonly step: string,
    public readonly packageName: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BundlerError";
    if (cause instanceof Error && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/** Wrap any thrown value into a BundlerError with context. */
export function wrapError(
  step: string,
  packageName: string,
  error: unknown,
): BundlerError {
  if (error instanceof BundlerError) return error;
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  return new BundlerError(step, packageName, `[${step}] ${packageName}: ${msg}`, error);
}

/** Throw a wrapped error immediately. */
export function failWith(
  step: string,
  packageName: string,
  error: unknown,
): never {
  throw wrapError(step, packageName, error);
}
