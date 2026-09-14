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
 * Represents a set of documents that will go into `applyMutations`. Before
 * applying a mutation, it's expected that all relevant documents that the
 * mutations affect are included, including those that do not exist yet.
 * Documents that don't exist have a `null` value.
 */
export type DocumentSet<TDocument extends SanityDocument = SanityDocument> = {
  [TDocumentId in string]?: TDocument | null
}

type SupportedPatchOperation = Exclude<keyof PatchOperations, 'merge'>

// > If multiple patches are included, then the order of execution is as follows:
// > - set, setIfMissing, unset, inc, dec, insert.
// > https://www.sanity.io/docs/http-mutations#5b4db1396e56
const patchOperations = {
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
}

/**
 * Returns the ID a created document gets. A missing `id` becomes a new random
 * unique ID; an `id` ending in `.` is used as the prefix for one; anything else
 * is used as-is.
 *
 * [- source](https://www.sanity.io/docs/http-mutations#c732f27330a4)
 */
export function getId(id?: string): string {
  if (!id || typeof id !== 'string') return randomUuid()
  if (id.endsWith('.')) return `${id}${randomUuid()}`
  return id
}

interface ProcessMutationsOptions {
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
   * The timestamp used for `_createdAt` and `_updatedAt` where applicable.
   * Defaults to now.
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
 * Applies the given mutations to the given document set. Every document the
 * mutations affect must be present in `documents`, with the value `null` for
 * documents that do not exist. A document deleted by the mutations keeps its ID
 * in the returned set, with a value of `null`.
 *
 * `transactionId` becomes the resulting `_rev` for every affected document, and
 * `timestamp`, when given, the relevant `_createdAt` and `_updatedAt`.
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
        // `_createdAt` falls back in order: the existing document's value,
        // then the mutation's own, then now
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
