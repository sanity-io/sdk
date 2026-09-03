/**
 * Captures a GROQ projection as a string literal type so Typegen can attribute a result
 * type to it, as `defineQuery` does for a whole query. Returns the projection unchanged.
 *
 * Lives here rather than in `groq`: GA `groq` has no `defineProjection`, and a type-only
 * module augmentation cannot add a runtime value. Replace with a re-export of `groq`'s
 * once it ships one; what apps import does not change.
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
