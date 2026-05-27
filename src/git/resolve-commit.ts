/**
 * Resolve the configured `commit` value into a concrete message or `null` to skip git.
 *
 * Accepts the value passed to `pkg.commit` (or a family-level override) and
 * produces the actual commit message to feed to git. Centralises the auto-message
 * behaviour so the rule lives in exactly one place.
 *
 * Rules:
 * - `string`    → use that string verbatim
 * - `true`      → auto-generate "Released <newVersion>"
 * - `false`     → null (skip git, same as undefined — explicit opt-out)
 * - `undefined` → null (skip git, back-compat default)
 *
 * @param commit     The raw `commit` value from the package or family config.
 * @param newVersion The freshly-resolved version for this release.
 * @returns The message to commit with, or `null` to skip git entirely.
 */
export function resolveCommitMessage(
  commit: string | boolean | undefined,
  newVersion: string,
): string | null {
  if (commit === true) {
    return `Released ${newVersion}`;
  }
  if (typeof commit === "string" && commit.length > 0) {
    return commit;
  }
  // false | undefined | empty string → skip git
  return null;
}
