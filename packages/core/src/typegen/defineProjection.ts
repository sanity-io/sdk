/**
 * Marks a projection for Typegen and returns the projection string unchanged, with its literal
 * type. `useDocumentProjection` matches that literal against the generated projection types.
 *
 * Pass the document type first so Typegen evaluates the projection for that type only. A
 * projection passed alone is evaluated for every document type in the schema, which generates
 * a result type for each.
 *
 * @example
 * ```ts
 * const preview = defineProjection('book', '{title, "author": author->name}')
 * ```
 *
 * @beta
 */
export function defineProjection<const TProjection extends string>(
  documentType: string,
  projection: TProjection,
): TProjection
/**
 * Marks a projection for Typegen and returns it unchanged. Typegen evaluates a projection
 * passed alone for every document type in the schema; pass the document type first to limit it
 * to one.
 *
 * @beta
 */
export function defineProjection<const TProjection extends string>(
  projection: TProjection,
): TProjection
export function defineProjection(first: string, second?: string): string {
  return second ?? first
}
