import './groqCompat'

import {
  type SanityProjectionsByResource,
  type SanityQueriesByResource,
  type SanitySchemasByResource,
} from '@sanity/client'
import {
  type SanityDocument,
  type SanityProjectionResult,
  type SanityProjections,
  type SanityQueries,
  type SanityQueryResult,
} from 'groq'

/**
 * Indexes `T` by `K`, or `never` when `K` is not a key of `T`.
 *
 * Deliberately exact. The legacy `groq` lookup falls back to the union of every registered
 * value on a miss, which lets a query resolve to another dataset's result type.
 */
type At<T, K> = K extends keyof T ? T[K] : never

/**
 * Fields Sanity adds to every document. A resource's schema union also carries object types
 * such as `slug`, which lack these, so this separates documents from the rest.
 * No index signature is required, so both type aliases and interfaces are supported.
 */
interface DocumentFields {
  _id: string
  _type: string
  _createdAt: string
  _updatedAt: string
  _rev: string
}

/**
 * Copies document fields into a type alias so interface registrations satisfy the
 * record constraints used by document actions without adding an index signature.
 */
type DocumentRecord<T> = {[K in keyof T]: T[K]}

/**
 * A registered document as it is when it already satisfies those constraints, as the type
 * aliases Typegen generates do, so editors show the generated name, such as `Movie`. Only an
 * interface registration, which lacks the index signature, goes through {@link DocumentRecord}.
 */
type RegisteredDocument<T> = T extends {[key: string]: unknown} ? T : DocumentRecord<T>

/**
 * The registered keys that a resource key known only as a pattern can stand for. A handle typed
 * without its project and dataset carries `${string}.${string}`, which matches every registered
 * key; `${string}.production` matches only production datasets; an unregistered literal key
 * matches none.
 */
type MatchingKeys<TRegistry, TSchemaId extends string> = Extract<keyof TRegistry, TSchemaId>

/**
 * True when a lookup should use the legacy path instead of a union across registered resources:
 * when the resource key matches no registration, or when the key or the thing looked up (the
 * document type, query or projection) is only `string`. The SDK's own default generics produce
 * that unspecific form to mean any document or action, so it must not narrow to the app's
 * registered types.
 */
type UsesLegacyLookup<
  TSchemaId extends string,
  TRegistry,
  TLookup extends string,
> = string extends TSchemaId
  ? true
  : string extends TLookup
    ? true
    : [MatchingKeys<TRegistry, TSchemaId>] extends [never]
      ? true
      : false

type DocumentIn<
  TSchemaId,
  TDocumentType extends string,
> = TSchemaId extends keyof SanitySchemasByResource
  ? RegisteredDocument<
      Extract<Extract<SanitySchemasByResource[TSchemaId], DocumentFields>, {_type: TDocumentType}>
    >
  : never

type QueryIn<TSchemaId, TQuery extends string> = TSchemaId extends keyof SanityQueriesByResource
  ? At<SanityQueriesByResource[TSchemaId], TQuery>
  : never

type ProjectionIn<
  TSchemaId,
  TDocumentType extends string,
  TProjection extends string,
> = TSchemaId extends keyof SanityProjectionsByResource
  ? // `Extract<..., object>` keeps this assignable to the `object` bound that
    // `ProjectionValuePending` places on a projection result. A projection always selects
    // fields into an object, so nothing is lost.
    Extract<
      ProjectionForDocumentType<SanityProjectionsByResource[TSchemaId], TDocumentType, TProjection>,
      object
    >
  : never

/**
 * The saved experimental result for exactly this query text, or `never`. The legacy lookup
 * itself answers a missing query with the union of every saved result, which would add
 * unrelated results to a union across resources.
 */
type LegacyQueryIn<
  TSchemaId extends string,
  TQuery extends string,
> = TQuery extends keyof SanityQueries ? SanityQueryResult<TQuery, TSchemaId> : never

/** The saved experimental result for exactly this projection text, or `never`. */
type LegacyProjectionIn<
  TSchemaId extends string,
  TDocumentType extends string,
  TProjection extends string,
> = TProjection extends keyof SanityProjections
  ? SanityProjectionResult<TProjection, TDocumentType, TSchemaId>
  : never

/**
 * Resolves a document type for one resource.
 *
 * A resource registered in `SanitySchemasByResource` is answered from there and only there:
 * a document type absent from a registered resource is `never`, never the legacy union,
 * because an unrelated union looks precise while describing the wrong dataset.
 *
 * A key known only as a pattern, such as `${string}.${string}` from a `DocumentHandle<'post'>`
 * prop or a resource chosen at runtime, resolves to the union of the document type across the
 * registered resources it can match: the document is one of those. A key that matches no
 * registration, or a lookup whose document type is also only `string`, uses the experimental
 * Typegen declarations as before, which is what keeps saved generated files working.
 *
 * @beta
 */
export type ResolveDocument<
  TDocumentType extends string = string,
  TSchemaId extends string = string,
> = TSchemaId extends keyof SanitySchemasByResource
  ? DocumentIn<TSchemaId, TDocumentType>
  : UsesLegacyLookup<TSchemaId, SanitySchemasByResource, TDocumentType> extends true
    ? SanityDocument<TDocumentType, TSchemaId>
    : // Also any saved experimental registrations of the same document type.
      | DocumentIn<MatchingKeys<SanitySchemasByResource, TSchemaId>, TDocumentType>
      | SanityDocument<TDocumentType, TSchemaId>

/**
 * Resolves a query result for one resource, selected by the exact query text.
 *
 * A key known only as a pattern gets the union of the query's result across the registered
 * resources it can match, plus the result saved by experimental Typegen for the same query
 * text, if any. See {@link ResolveDocument} for why a registered resource does not fall
 * through, and when the experimental Typegen declarations apply.
 *
 * @beta
 */
export type ResolveQueryResult<
  TQuery extends string = string,
  TSchemaId extends string = string,
> = TSchemaId extends keyof SanityQueriesByResource
  ? QueryIn<TSchemaId, TQuery>
  : UsesLegacyLookup<TSchemaId, SanityQueriesByResource, TQuery> extends true
    ? SanityQueryResult<TQuery, TSchemaId>
    :
        | QueryIn<MatchingKeys<SanityQueriesByResource, TSchemaId>, TQuery>
        | LegacyQueryIn<TSchemaId, TQuery>

/**
 * Resolves a projection result for one resource and document type.
 *
 * A projection runs against the document its handle names, so the same projection text
 * resolves differently per document type as well as per resource. A resource key known only as
 * a pattern gets the union across the registered resources it can match, plus the result saved
 * by experimental Typegen for the same projection text, as in {@link ResolveDocument}.
 *
 * @beta
 */
export type ResolveProjectionResult<
  TProjection extends string = string,
  TDocumentType extends string = string,
  TSchemaId extends string = string,
> = TSchemaId extends keyof SanityProjectionsByResource
  ? ProjectionIn<TSchemaId, TDocumentType, TProjection>
  : UsesLegacyLookup<TSchemaId, SanityProjectionsByResource, TProjection> extends true
    ? SanityProjectionResult<TProjection, TDocumentType, TSchemaId>
    :
        | ProjectionIn<
            MatchingKeys<SanityProjectionsByResource, TSchemaId>,
            TDocumentType,
            TProjection
          >
        | LegacyProjectionIn<TSchemaId, TDocumentType, TProjection>

/**
 * Looks up a projection under one document type. A handle whose document type is only known as
 * `string`, as with handles from a document list, gets the union of the projection's result
 * across every document type it was generated for.
 */
type ProjectionForDocumentType<
  TProjections,
  TDocumentType extends string,
  TProjection extends string,
> = string extends TDocumentType
  ? {[K in keyof TProjections]: At<TProjections[K], TProjection>}[keyof TProjections]
  : At<At<TProjections, TDocumentType>, TProjection>
