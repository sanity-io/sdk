/**
 * Declares the resource-keyed Typegen interfaces on `@sanity/client`, keyed by the
 * resource address `projectId.dataset`.
 *
 * Generated files augment these. `@sanity/client` does not declare them yet, so they are
 * declared here; empty interfaces merge with both a generated file's entries and with
 * `@sanity/client`'s own declarations once it ships them.
 *
 * Delete once `@sanity/client` declares these. Nothing an app imports changes then.
 *
 * @example
 * ```ts
 * declare module '@sanity/client' {
 *   interface SanitySchemasByResource {
 *     'gz665um.marketing': Post | Author
 *   }
 *   interface SanityQueriesByResource {
 *     'gz665um.marketing': {'*[_type == "post"]': Post[]}
 *   }
 *   interface SanityProjectionsByResource {
 *     'gz665um.marketing': {'{title}': {post: {title: string | null}}}
 *   }
 * }
 * ```
 */

/* eslint-disable @typescript-eslint/no-empty-object-type -- augmentation targets:
   generated files merge entries in, so they stay empty interfaces here. */
declare module '@sanity/client' {
  /** Resource address to the union of every type in that resource's schema. */
  export interface SanitySchemasByResource {}

  /** Resource address to a map of query string to result type. */
  export interface SanityQueriesByResource {}

  /** Resource address to a map of projection string to a per-document-type result map. */
  export interface SanityProjectionsByResource {}
}

export {}
