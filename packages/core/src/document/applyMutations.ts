import {
  type Mutation,
  type MutationSelection,
  type PatchOperations,
  type SanityDocument,
} from '@sanity/types'

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

export type DocumentSet = {[TDocumentId in string]?: SanityDocument | null}

type SupportPatchOperation = Exclude<keyof PatchOperations, 'merge'>
const patchOperations = {
  dec,
  diffMatchPatch,
  inc,
  insert,
  set,
  setIfMissing,
  unset,
  ifRevisionID,
} satisfies {
  [K in SupportPatchOperation]: (
    input: unknown,
    pathExpressions: NonNullable<PatchOperations[K]>,
  ) => unknown
}

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
  if (typeof id !== 'string') return crypto.randomUUID()
  if (id.endsWith('.')) return `${id}${crypto.randomUUID()}`
  return id
}

export interface ApplyMutationsOptions {
  transactionId: string
  documents: DocumentSet
  mutations: Mutation[]
}

function getDocumentIds(selection: MutationSelection) {
  if ('id' in selection) {
    const array = Array.isArray(selection.id) ? selection.id : [selection.id]
    const ids = array.filter((id): id is string => typeof id === 'string')
    return Array.from(new Set(ids))
  }

  if ('query' in selection) {
    throw new Error(`'query' in mutations is not supported.`)
  }

  return []
}

export function applyMutations({
  documents,
  mutations,
  transactionId,
}: ApplyMutationsOptions): DocumentSet {
  // early return if there are no documents in the set
  if (!Object.keys(documents).length) return documents

  const dataset = {...documents}

  for (const mutation of mutations) {
    if ('create' in mutation) {
      const id = getId(mutation.create._id)

      const document: SanityDocument = {
        // we use the `_createdAt` provided by the user if present
        // abd fallback to these if not present.
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
        ...mutation.create,
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
        // we use the `_createdAt` provided by the user if present
        // abd fallback to these if not present.
        _createdAt: prev?._createdAt || new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
        ...mutation.createOrReplace,
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
        // we use the `_createdAt` provided by the user if present
        // abd fallback to these if not present.
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
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
          _updatedAt: new Date().toISOString(),
        }
      }

      continue
    }
  }

  return dataset
}
