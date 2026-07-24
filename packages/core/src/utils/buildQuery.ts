/**
 * Serialises store options into a `@sanity/client` request query object.
 * Scalars are stringified and `undefined` values dropped; string arrays pass
 * through untouched so the client serialises them as repeated keys
 * (`permissions=a&permissions=b`).
 *
 * @internal
 */
export function buildQuery(
  params: Record<string, string | number | boolean | string[] | undefined>,
): Record<string, string | string[]> {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, Array.isArray(value) ? value : String(value)]),
  )
}
