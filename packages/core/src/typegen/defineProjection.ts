/**
 * Preserves a projection string's literal type and returns the string unchanged.
 * Use this import when migrating an app with existing experimental Typegen output.
 *
 * Current Typegen does not scan this helper. New or changed projections need an
 * explicit result type until projection generation is supported.
 *
 * @example
 * ```ts
 * const preview = defineProjection('{title, "author": author->name}')
 * ```
 *
 * @beta
 */
export function defineProjection<const TProjection extends string>(
  projection: TProjection,
): TProjection {
  return projection
}
