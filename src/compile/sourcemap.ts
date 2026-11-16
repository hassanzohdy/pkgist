/** The `sourcemap` package option: a flag, or an object with finer controls. */
export type SourcemapOption = boolean | { excludeSources?: boolean };

/**
 * Normalise the `sourcemap` package option.
 *
 * - `undefined` / `true` / `{}` → emit maps with the original sources inside.
 * - `false` → no maps.
 * - `{ excludeSources: true }` → emit maps without `sourcesContent`.
 */
export function resolveSourcemap(option: SourcemapOption | undefined): {
  emit: boolean;
  excludeSources: boolean;
} {
  if (option === false) return { emit: false, excludeSources: false };
  if (typeof option === "object" && option !== null) {
    return { emit: true, excludeSources: option.excludeSources === true };
  }
  return { emit: true, excludeSources: false };
}
