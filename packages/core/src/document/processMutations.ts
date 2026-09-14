import {
  type Mutation,
  type MutationSelection,
  type PatchOperations,
  type SanityDocument,
} from '@sanity/types'

import {randomUuid} from '../utils/ids'
import {
  dec,
  diffMatchPatch,
  ifRevisionID,
  inc,
  insert,
  set,
  setIfMissing,
  unset,
} from './patchOperations'

/**
 * Maps document IDs to documents, using `null` for documents that do not exist.
 *
 * @beta
 */
export type DocumentSet<TDocument extends SanityDocument = SanityDocument> = {
  [TDocumentId in string]?: TDocument | null
}

type SupportedPatchOperation = Exclude<keyof PatchOperations, 'merge'>

/**
 * Exposes the patch operations used by {@link processMutations}.
 *
 * @remarks
 * Property order determines execution order in {@link processMutations}:
 * `ifRevisionID`, `set`, `setIfMissing`, `unset`, `inc`, `dec`, `insert`,
 * then `diffMatchPatch`. Reordering the properties changes mutation results.
 * Freezes the collection to prevent callers from replacing the functions
 * used by the SDK's mutation evaluator.
 *
 * @see https://www.sanity.io/docs/http-mutations#5b4db1396e56
 *
 * @example
 * ```ts
 * const document = {items: [{_key: 'a', title: 'Before'}]}
 * const updated = patchOperations.set<typeof document>(document, {
 *   'items[_key=="a"].title': 'After',
 * })
 * ```
 *
 * @internal
 */
export const patchOperations = Object.freeze({
  ifRevisionID,
  set,
  setIfMissing,
  unset,
  inc,
  dec,
  insert,
  diffMatchPatch,
} satisfies {
  [K in SupportedPatchOperation]: (
    input: unknown,
    pathExpressions: NonNullable<PatchOperations[K]>,
  ) => unknown
})

/**
 * Implements ID generation:
 *
 * A create mutation creates a new document. It takes the literal document
 * content as its argument. The rules for the new document's identifier are as
 * follows:
 *
 * - If the `_id` attribute is missing, then a new, random, unique ID is
 *   generated.
 * - If the `_id` attribute is present but ends with `.`, then it is used as a
 *   prefix for a new, random, unique ID.
 * - If the _id attribute is present, it is used as-is.
 *
 * [- source](https://www.sanity.io/docs/http-mutations#c732f27330a4)
 */
export function getId(id?: string): string {
  if (!id || typeof id !== 'string') return randomUuid()
  if (id.endsWith('.')) return `${id}${randomUuid()}`
  return id
}

/**
 * Configures {@link processMutations}.
 *
 * @internal
 */
export interface ProcessMutationsOptions {
  /**
   * The transaction ID that will become the next `_rev` for documents mutated
   * by the given mutations.
   */
  transactionId: string
  /**
   * The input document set that the mutations will be applied to.
   */
  documents: DocumentSet
  /**
   * A list of mutations to apply to the given document set.
   */
  mutations: Mutation[]
  /**
   * Supplies the default `_createdAt` and `_updatedAt` timestamps.
   * Uses the current time when omitted or empty.
   */
  timestamp?: string
}

export function getDocumentIds(selection: MutationSelection): string[] {
  if ('id' in selection) {
    // NOTE: the `MutationSelection` type within `@sanity/client` (instead of
    // `@sanity/types`) allows for the ID field to be an array of strings so we
    // support that as well
    const array = Array.isArray(selection.id) ? selection.id : [selection.id]
    const ids = array.filter((id): id is string => typeof id === 'string')
    return Array.from(new Set(ids))
  }

  if ('query' in selection) {
    throw new Error(`'query' in mutations is not supported.`)
  }

  return []
}

/**
 * Applies mutations to an in-memory document set.
 * Deleted documents remain in the returned set with a value of `null`.
 *
 * Returns the input map when `mutations` is empty. Results can share document
 * and nested-value references with the input.
 *
 * Sets `_rev` to `transactionId` on created, replaced, and patched documents.
 * Uses `timestamp` for timestamps unless the mutation preserves them.
 * Ignores `merge` patches; `inc` and `dec` skip values that are not numbers.
 * Generates document IDs when omitted or ending in `.`.
 * Patch operations can generate missing array keys.
 *
 * @remarks
 * Uses the SDK's evaluator so callers share its mutation semantics without
 * starting a client or document store. Does not run Content Lake's server
 * validation or persist documents.
 *
 * @throws If a selection uses a query, a `create` targets an existing document,
 * or a `patch` targets a document that does not exist.
 * @throws If a patch operation fails, including a revision check failure or
 * `diffMatchPatch` applied to a value other than a string or `undefined`.
 *
 * @internal
 */
export function processMutations({
  documents,
  mutations,
  transactionId,
  timestamp,
}: ProcessMutationsOptions): DocumentSet {
  // early return if there are no mutations given
  if (!mutations.length) return documents

  const dataset = {...documents}
  const now = timestamp || new Date().toISOString()

  for (const mutation of mutations) {
    if ('create' in mutation) {
      const id = getId(mutation.create._id)

      if (dataset[id]) {
        throw new Error(
          `Cannot create document with \`_id\` \`${id}\` because another document with the same ID already exists.`,
        )
      }

      const document: SanityDocument = {
        // > `_createdAt` and `_updatedAt` may be submitted and will override
        // > the default which is of course the current time. This can be used
        // > to reconstruct a data-set with its timestamp structure intact.
        // >
        // > [- source](https://www.sanity.io/docs/http-mutations#c732f27330a4)
        _createdAt: now,
        _updatedAt: now,
        ...mutation.create, // prefer the user's `_createdAt` and `_updatedAt`
        _rev: transactionId,
        _id: id,
      }

      dataset[id] = document

      continue
    }

    if ('createOrReplace' in mutation) {
      const id = getId(mutation.createOrReplace._id)
      const prev = dataset[id]

      const document: SanityDocument = {
        ...mutation.createOrReplace,
        // otherwise, if the mutation provided, a `_createdAt` time, use it,
        // otherwise default to now
        _createdAt:
          // if there was an existing document, use the previous `_createdAt`
          // since we're replacing the current document
          prev?._createdAt ||
          // if there was no previous document, then we're creating this
          // document for the first time so we should use the `_createdAt` from
          // the mutation if the user included it
          (typeof mutation.createOrReplace['_createdAt'] === 'string' &&
            mutation.createOrReplace['_createdAt']) ||
          // otherwise, default to now
          now,

        _updatedAt:
          // if there was an existing document, then set the `_updatedAt` to now
          // since we're replacing the current document
          prev
            ? now
            : // otherwise, we're creating this document for the first time,
              // in that case, use the user's `_updatedAt` if included in the
              // mutation
              (typeof mutation.createOrReplace['_updatedAt'] === 'string' &&
                mutation.createOrReplace['_updatedAt']) ||
              // otherwise default to now
              now,
        _rev: transactionId,
        _id: id,
      }

      dataset[id] = document

      continue
    }

    if ('createIfNotExists' in mutation) {
      const id = getId(mutation.createIfNotExists._id)
      const prev = dataset[id]
      if (prev) continue

      const document: SanityDocument = {
        // same logic as `create`:
        // prefer the user's `_createdAt` and `_updatedAt`
        _createdAt: now,
        _updatedAt: now,
        ...mutation.createIfNotExists,
        _rev: transactionId,
        _id: id,
      }

      dataset[id] = document

      continue
    }

    if ('delete' in mutation) {
      for (const id of getDocumentIds(mutation.delete)) {
        dataset[id] = null
      }

      continue
    }

    if ('patch' in mutation) {
      const {patch} = mutation
      const ids = getDocumentIds(patch)

      const patched = ids.map((id) => {
        if (!dataset[id]) {
          throw new Error(`Cannot patch document with ID \`${id}\` because it was not found.`)
        }

        type Entries<T> = {[K in keyof T]: [K, T[K]]}[keyof T][]
        const entries = Object.entries(patchOperations) as Entries<typeof patchOperations>

        return entries.reduce((acc, [type, operation]) => {
          if (patch[type]) {
            return operation(
              acc,
              // @ts-expect-error TS doesn't handle this union very well
              patch[type],
            )
          }
          return acc
        }, dataset[id])
      })

      for (const result of patched) {
        dataset[result._id] = {
          ...result,
          _rev: transactionId,
          _updatedAt: now,
        }
      }

      continue
    }
  }

  return dataset
}
