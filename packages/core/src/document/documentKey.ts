import {DocumentId, getPublishedId} from '@sanity/id-utils'
import {type DocumentSystem} from '@sanity/types'

import {type DocumentHandle, type PerspectiveHandle} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'

const KEY_PREFIX = '!'
const VARIANT_DEFINITION_PREFIX = '_.variants.'

/**
 * A deterministic key standing in for a document whose concrete `_id` is not
 * yet known, because the document is a variant pending creation in the remote
 * dataset. Its format is deliberately invalid as a Content Lake id so it can
 * never collide with a real one, and it must never be sent to Content Lake.
 *
 * @beta
 */
export type UnknownDocumentId = string & {readonly __brand: 'UnknownDocumentId'}

/**
 * The bundle a handle's perspective addresses when writing: a release name, or
 * `'drafts'` for every other perspective.
 *
 * The published bundle is never addressed: `'published'` resolves to
 * `'drafts'`, matching the document store, which reads and writes the draft
 * for non-release perspectives. Callers that need the published bundle (which
 * Content Lake conveys by omitting the bundle) must ask for it explicitly.
 *
 * @internal
 */
export function getBundleId(perspective: PerspectiveHandle['perspective']): string {
  if (isReleasePerspective(perspective)) return perspective.releaseName
  return 'drafts'
}

/**
 * Derives a stable, deterministic key for the document a handle addresses.
 *
 * Unlike `_id`, the key can be computed before the document exists and is the
 * same whether or not the document's concrete id is known, which makes it
 * suitable as a React `key` when rendering lists of documents. Prefer it to
 * `_id`, which may be absent while a variant is pending creation.
 *
 * The format is `!<documentGroupId>:<bundleId>,<variant>`. The leading `!`
 * and the separators are illegal in Content Lake ids, so a key never collides
 * with a real id. The format admits further comma-separated variants in
 * future.
 *
 * @beta
 */
export function getDocumentKey(
  handle: Pick<DocumentHandle, 'documentId' | 'perspective' | 'variant' | 'liveEdit'>,
): string {
  const groupId = getPublishedId(DocumentId(handle.documentId))
  const bundleId = handle.liveEdit ? undefined : getBundleId(handle.perspective)
  return buildKey(groupId, bundleId, handle.variant)
}

/**
 * Derives the same key as {@link getDocumentKey} from a variant document's
 * `_system` fields, the canonical source of its group, bundle, and variant
 * membership (its `_id` is an opaque hash). Returns `undefined` for
 * non-variant documents: `_system` is only guaranteed on variant documents
 * until the backfill lands, so their identity is still read from `_id`.
 *
 * @internal
 */
export function getDocumentKeyFromSystem(document: Record<string, unknown>): string | undefined {
  // documents arrive typed loosely from the client, so `_system` is narrowed
  // here rather than trusted
  const system = document['_system'] as Partial<DocumentSystem> | undefined
  if (!system?.variant?._ref || !system.group?._ref) return undefined
  return buildKey(system.group._ref, system.bundleId, getVariantName(system.variant._ref))
}

/**
 * Brands a document key as the store key for a variant pending creation.
 * @internal
 */
export function toUnknownDocumentId(key: string): UnknownDocumentId {
  return key as UnknownDocumentId
}

/**
 * Whether a store key is an {@link UnknownDocumentId} rather than a concrete
 * Content Lake id. Check this before passing a key to any `@sanity/id-utils`
 * helper; they reject the key's format.
 *
 * @beta
 */
export function isUnknownDocumentId(id: string): id is UnknownDocumentId {
  return id.startsWith(KEY_PREFIX)
}

/**
 * The document group id for any store key, concrete or unknown.
 * @internal
 */
export function getGroupIdFromStoreKey(id: string): string {
  if (!isUnknownDocumentId(id)) return getPublishedId(DocumentId(id))
  return id.slice(KEY_PREFIX.length, id.indexOf(':'))
}

function buildKey(groupId: string, bundleId: string | undefined, variant: string | undefined) {
  return `${KEY_PREFIX}${groupId}:${bundleId ?? ''},${variant ?? ''}`
}

function getVariantName(definitionRef: string): string {
  return definitionRef.startsWith(VARIANT_DEFINITION_PREFIX)
    ? definitionRef.slice(VARIANT_DEFINITION_PREFIX.length)
    : definitionRef
}
