import {describe, expect, it} from 'vitest'

import {
  getBundleId,
  getDocumentKey,
  getDocumentKeyFromSystem,
  getGroupIdFromStoreKey,
  isUnknownDocumentId,
  toUnknownDocumentId,
} from './documentKey'

describe('getBundleId', () => {
  it('returns the release name for a release perspective', () => {
    expect(getBundleId({releaseName: 'summer'})).toBe('summer')
  })

  it('returns drafts for the default and drafts perspectives', () => {
    expect(getBundleId(undefined)).toBe('drafts')
    expect(getBundleId('drafts')).toBe('drafts')
  })

  it('treats published as drafts, matching the document store', () => {
    expect(getBundleId('published')).toBe('drafts')
  })
})

describe('getDocumentKey', () => {
  it('encodes group, bundle, and variant', () => {
    expect(getDocumentKey({documentId: 'doc', variant: 'french'})).toBe('!doc:drafts,french')
  })

  it('normalises the document id to the group id', () => {
    expect(getDocumentKey({documentId: 'drafts.doc', variant: 'french'})).toBe('!doc:drafts,french')
    expect(getDocumentKey({documentId: 'versions.summer.doc', variant: 'french'})).toBe(
      '!doc:drafts,french',
    )
  })

  it('uses the release name as the bundle for a release perspective', () => {
    expect(
      getDocumentKey({documentId: 'doc', perspective: {releaseName: 'summer'}, variant: 'french'}),
    ).toBe('!doc:summer,french')
  })

  it('leaves the variant empty for non-variant handles', () => {
    expect(getDocumentKey({documentId: 'doc'})).toBe('!doc:drafts,')
  })

  it('omits the bundle for liveEdit documents', () => {
    expect(getDocumentKey({documentId: 'doc', liveEdit: true})).toBe('!doc:,')
  })

  it('is stable across calls with equivalent handles', () => {
    const explicitPerspective = getDocumentKey({
      documentId: 'doc',
      perspective: 'drafts',
      variant: 'french',
    })
    const defaultPerspective = getDocumentKey({documentId: 'doc', variant: 'french'})
    expect(explicitPerspective).toBe(defaultPerspective)
  })
})

describe('getDocumentKeyFromSystem', () => {
  it('derives the same key as getDocumentKey for a variant-over-drafts document', () => {
    const key = getDocumentKeyFromSystem({
      _system: {
        bundleId: 'drafts',
        variant: {_ref: '_.variants.french', _weak: true},
        group: {_ref: 'doc', _weak: true},
      },
    })
    expect(key).toBe(getDocumentKey({documentId: 'doc', variant: 'french'}))
  })

  it('treats an absent bundleId as the published bundle', () => {
    expect(
      getDocumentKeyFromSystem({
        _system: {
          variant: {_ref: '_.variants.french', _weak: true},
          group: {_ref: 'doc', _weak: true},
        },
      }),
    ).toBe('!doc:,french')
  })

  it('uses the release name as the bundle for a variant-over-release document', () => {
    expect(
      getDocumentKeyFromSystem({
        _system: {
          bundleId: 'summer',
          variant: {_ref: '_.variants.french', _weak: true},
          group: {_ref: 'doc', _weak: true},
        },
      }),
    ).toBe('!doc:summer,french')
  })

  it('returns undefined for non-variant documents', () => {
    expect(getDocumentKeyFromSystem({})).toBeUndefined()
    expect(getDocumentKeyFromSystem({_system: {bundleId: 'drafts'}})).toBeUndefined()
  })
})

describe('UnknownDocumentId', () => {
  it('recognises keys and rejects concrete ids', () => {
    expect(isUnknownDocumentId(toUnknownDocumentId(getDocumentKey({documentId: 'doc'})))).toBe(true)
    expect(isUnknownDocumentId('doc')).toBe(false)
    expect(isUnknownDocumentId('drafts.doc')).toBe(false)
    expect(isUnknownDocumentId('versions.abc.doc')).toBe(false)
  })
})

describe('getGroupIdFromStoreKey', () => {
  it('extracts the group from an unknown document id', () => {
    expect(getGroupIdFromStoreKey('!doc:drafts,french')).toBe('doc')
  })

  it('extracts the group from concrete ids', () => {
    expect(getGroupIdFromStoreKey('doc')).toBe('doc')
    expect(getGroupIdFromStoreKey('drafts.doc')).toBe('doc')
    expect(getGroupIdFromStoreKey('versions.summer.doc')).toBe('doc')
  })
})
