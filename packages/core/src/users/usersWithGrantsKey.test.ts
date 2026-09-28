import {describe, expect, it} from 'vitest'

import {type DocumentHandle} from '../config/sanityConfig'
import {DEFAULT_USERS_BATCH_SIZE} from './usersConstants'
import {getUsersWithGrantsKey, parseUsersWithGrantsKey} from './usersWithGrantsKey'

const document: DocumentHandle = {documentId: 'article-1', documentType: 'article'}

describe('usersWithGrants keys', () => {
  it('separates reads that differ only by search terms', () => {
    expect(getUsersWithGrantsKey({document, displayName: 'ada'})).not.toEqual(
      getUsersWithGrantsKey({document, displayName: 'grace'}),
    )
  })

  it('separates reads that differ only by document', () => {
    expect(getUsersWithGrantsKey({document})).not.toEqual(
      getUsersWithGrantsKey({
        document: {documentId: 'article-2', documentType: 'article'},
      }),
    )
  })

  it('is stable across the key order of a caller object literal', () => {
    expect(
      getUsersWithGrantsKey({
        document: {documentType: 'article', documentId: 'article-1'},
      }),
    ).toEqual(getUsersWithGrantsKey({document}))
  })

  it('round-trips the search terms and the document', () => {
    // React reads and resolves against the parsed key rather than the options
    // it was handed, so anything the key loses is a field the read ignores.
    const parsed = parseUsersWithGrantsKey(
      getUsersWithGrantsKey({
        document,
        batchSize: 25,
        displayName: 'ada',
        email: 'ada@example.com',
        sortBy: 'displayName',
        orderBy: 'desc',
      }),
    )

    expect(parsed).toEqual({
      document: {documentId: 'article-1', documentType: 'article'},
      batchSize: 25,
      displayName: 'ada',
      email: 'ada@example.com',
      sortBy: 'displayName',
      orderBy: 'desc',
    })
  })

  it('keys the default batch size explicitly', () => {
    // Otherwise asking for the default and not asking at all would be two
    // keys over one entry.
    expect(getUsersWithGrantsKey({document})).toEqual(
      getUsersWithGrantsKey({document, batchSize: DEFAULT_USERS_BATCH_SIZE}),
    )
  })
})
