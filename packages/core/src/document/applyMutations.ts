import {applyPatches, parsePatch} from '@sanity/diff-match-patch'
import {type Mutation, type MutationSelection, type SanityDocument} from '@sanity/types'

import {dec, inc, insert, jsonMatch, set, setDeep, setIfMissing, unset} from './patchOperations'

export type DocumentSet = {[TDocumentId in string]?: SanityDocument | null}

function getId(id?: string) {
  if (typeof id !== 'string') return crypto.randomUUID()
  if (id.endsWith('.')) return `${id}${crypto.randomUUID()}`
  return id
}

interface ApplyMutationsOptions {
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
        ...mutation.create,
        _rev: transactionId,
        _id: id,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      dataset[id] = document

      continue
    }

    if ('createOrReplace' in mutation) {
      const id = getId(mutation.createOrReplace._id)
      const prev = dataset[id]

      const document: SanityDocument = {
        ...mutation.createOrReplace,
        _rev: transactionId,
        _id: id,
        _createdAt: prev?._createdAt || new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }

      dataset[id] = document

      continue
    }

    if ('createIfNotExists' in mutation) {
      const id = getId(mutation.createIfNotExists._id)
      const prev = dataset[id]
      if (prev) continue

      const document: SanityDocument = {
        ...mutation.createIfNotExists,
        _rev: transactionId,
        _id: id,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
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

        let input = dataset[id]

        if (patch.ifRevisionID) {
          if (patch.ifRevisionID !== input._rev) {
            throw new Error(
              `Patch's revision ID \`${patch.ifRevisionID}\` does not match document's revision ID \`${input._rev}\``,
            )
          }
        }

        if (patch.inc) {
          input = inc({input, pathExpressionValues: patch.inc})
        }

        if (patch.dec) {
          input = dec({input, pathExpressionValues: patch.dec})
        }

        if (patch.insert) {
          input = insert({input, ...patch.insert})
        }

        if (patch.set) {
          input = set({input, pathExpressionValues: patch.set})
        }

        if (patch.setIfMissing) {
          input = setIfMissing({
            input,
            pathExpressionValues: patch.setIfMissing,
          })
        }

        if (patch.unset) {
          input = unset({input, pathExpressions: patch.unset})
        }

        if (patch.diffMatchPatch) {
          input = Object.entries(patch.diffMatchPatch)
            .flatMap(([pathExpression, dmp]) =>
              jsonMatch({input, pathExpression}).map((m) => ({
                ...m,
                dmp,
              })),
            )
            .map(({path, value, dmp}) => {
              if (typeof value !== 'string') {
                throw new Error(
                  `Can't diff-match-patch \`${JSON.stringify(path)}\`, because it is not a string`,
                )
              }

              return {
                path,
                value: applyPatches(parsePatch(dmp), value)[0],
              }
            })
            .reduce((acc, {path, value}) => setDeep({input: acc, path, value}), input)
        }

        input = {
          ...input,
          _updatedAt: new Date().toISOString(),
          _rev: transactionId,
        }

        return input
      })

      for (const result of patched) {
        dataset[result._id] = result
      }

      continue
    }
  }

  return dataset
}
