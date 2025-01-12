import {
  append as _append,
  assign as _assign,
  at as _at,
  autoKeys as _autoKeys,
  create as _create,
  createIfNotExists as _createIfNotExists,
  createOrReplace as _createOrReplace,
  dec as _dec,
  del as _del,
  destroy as _destroy,
  diffMatchPatch as _diffMatchPatch,
  inc as _inc,
  insert as _insert,
  insertAfter as _insertAfter,
  insertBefore as _insertBefore,
  type Mutation,
  patch as _patch,
  prepend as _prepend,
  remove as _remove,
  replace as _replace,
  set as _set,
  setIfMissing as _setIfMissing,
  truncate as _truncate,
  unassign as _unassign,
  unset as _unset,
  upsert as _upsert,
} from '@sanity/mutate'

import {randomId} from '../preview/util'
import {createAction} from '../resources/createAction'
import {getDocumentStore} from './documentStore'

/**
 * Submits mutations to content-lake as well as applies them
 * locally/optimistically.
 *
 * Returns false if the optimistic store has not been initialized yet.
 *
 * @beta
 */
export const mutate = createAction(getDocumentStore, ({state}) => {
  return function (mutation: Mutation[]) {
    const {optimisticStore} = state.get()
    if (!optimisticStore) return false

    const result = optimisticStore.mutate(mutation)
    state.set('updateMutationRefreshKey', {mutationRefreshKey: randomId()})
    return result
  }
})

// `@sanity/mutate` does not ship with distribution tags for the operations
// so we add them and re-export them here for now.
/**
 * @public
 */
export const append = _append

/**
 * @public
 */
export const assign = _assign

/**
 * @public
 */
export const at = _at

/**
 * @public
 */
export const autoKeys = _autoKeys

/**
 * @public
 */
export const create = _create

/**
 * @public
 */
export const createIfNotExists = _createIfNotExists

/**
 * @public
 */
export const createOrReplace = _createOrReplace

/**
 * @public
 */
export const dec = _dec

/**
 * @public
 */
export const del = _del

/**
 * @public
 */
export const destroy = _destroy

/**
 * @public
 */
export const diffMatchPatch = _diffMatchPatch

/**
 * @public
 */
export const inc = _inc

/**
 * @public
 */
export const insert = _insert

/**
 * @public
 */
export const insertAfter = _insertAfter

/**
 * @public
 */
export const insertBefore = _insertBefore

/**
 * @public
 */
export const patch = _patch

/**
 * @public
 */
export const prepend = _prepend

/**
 * @public
 */
export const remove = _remove

/**
 * @public
 */
export const replace = _replace

/**
 * @public
 */
export const set = _set

/**
 * @public
 */
export const setIfMissing = _setIfMissing

/**
 * @public
 */
export const truncate = _truncate

/**
 * @public
 */
export const unassign = _unassign

/**
 * @public
 */
export const unset = _unset

/**
 * @public
 */
export const upsert = _upsert
