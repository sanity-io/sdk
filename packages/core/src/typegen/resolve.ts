import './groqCompat'

import {
  type SanityProjectionsByResource,
  type SanityQueriesByResource,
  type SanitySchemasByResource,
} from '@sanity/client'
import {type SanityDocument, type SanityProjectionResult, type SanityQueryResult} from 'groq'

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
 * Resolves a document type for one resource.
 *
 * A resource registered in `SanitySchemasByResource` is answered from there and only there:
 * a document type absent from a registered resource is `never`, never the legacy union,
 * because an unrelated union looks precise while describing the wrong dataset. A resource
 * with no registration falls back to the experimental Typegen declarations, which is what
 * keeps saved generated files working.
 *
 * @beta
 */
export type ResolveDocument<
  TDocumentType extends string = string,
  TSchemaId extends string = string,
> = TSchemaId extends keyof SanitySchemasByResource
  ? DocumentRecord<
      Extract<Extract<SanitySchemasByResource[TSchemaId], DocumentFields>, {_type: TDocumentType}>
    >
  : SanityDocument<TDocumentType, TSchemaId>

/**
 * Resolves a query result for one resource, selected by the exact query text.
 *
 * Falls back to the experimental Typegen declarations for an unregistered resource. See
 * {@link ResolveDocument} for why a registered resource does not fall through.
 *
 * @beta
 */
export type ResolveQueryResult<
  TQuery extends string = string,
  TSchemaId extends string = string,
> = TSchemaId extends keyof SanityQueriesByResource
  ? At<SanityQueriesByResource[TSchemaId], TQuery>
  : SanityQueryResult<TQuery, TSchemaId>

/**
 * Resolves a projection result for one resource and document type.
 *
 * A projection runs against the document its handle names, so the same projection text
 * resolves differently per document type as well as per resource.
 *
 * @beta
 */
export type ResolveProjectionResult<
  TProjection extends string = string,
  TDocumentType extends string = string,
  TSchemaId extends string = string,
> = TSchemaId extends keyof SanityProjectionsByResource
  ? // `Extract<..., object>` keeps this assignable to the `object` bound that
    // `ProjectionValuePending` places on a projection result. A projection always selects
    // fields into an object, so nothing is lost.
    Extract<At<At<SanityProjectionsByResource[TSchemaId], TDocumentType>, TProjection>, object>
  : SanityProjectionResult<TProjection, TDocumentType, TSchemaId>
