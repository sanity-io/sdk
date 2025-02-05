import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type DocumentSet, getDocumentIds, getId, processMutations} from './processMutations'

// A base document set that is not empty (so applyMutations will run)
const baseDocs: DocumentSet = {
  existingDoc: {
    _id: 'existingDoc',
    _type: 'test',
    _createdAt: '2020-01-01T00:00:00Z',
    _updatedAt: '2020-01-01T00:00:00Z',
    _rev: 'rev0',
    value: 10,
    title: 'Old Title',
    arrayField: ['a', 'b', 'c'],
    description: 'the quick brown fox',
  },
}

// Stub crypto.randomUUID so that tests are deterministic
beforeEach(() => {
  vi.stubGlobal('crypto', {randomUUID: vi.fn(() => 'fixed-uuid')})
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getId', () => {
  it('should generate a new id when undefined is passed', () => {
    expect(getId(undefined)).toBe('fixed-uuid')
  })

  it('should return the provided id if it does not end with "."', () => {
    expect(getId('my-id')).toBe('my-id')
  })

  it('should append a random uuid when the provided id ends with "."', () => {
    expect(getId('prefix.')).toBe('prefix.fixed-uuid')
  })
})

describe('getDocumentIds', () => {
  it('takes in a mutation selection object and normalizes it to an array of ID strings', () => {
    expect(getDocumentIds({id: 'single-id'})).toEqual(['single-id'])
  })

  it('takes in a mutation selection object with an array of `id` and returns those IDs', () => {
    expect(
      getDocumentIds({
        // @ts-expect-error testing input that is supported but not typed
        id: ['first-id', 'second-id'],
      }),
    ).toEqual(['first-id', 'second-id'])
  })

  it('returns an empty array if no `id` key was provided', () => {
    expect(
      getDocumentIds(
        // @ts-expect-error testing invalid input
        {},
      ),
    ).toEqual([])
  })

  it('throws if there is a `query` in the mutation selection', () => {
    expect(() => getDocumentIds({query: '*'})).toThrow(/'query' in mutations is not supported./)
  })
})

describe('applyMutations', () => {
  let docs: DocumentSet
  const transactionId = 'tx1'
  const timestamp = '2025-02-02T00:00:00Z'

  // Clone baseDocs for each test so that mutations do not bleed between tests.
  beforeEach(() => {
    docs = JSON.parse(JSON.stringify(baseDocs))
  })

  describe('create mutation', () => {
    it('should create a new document with an auto-generated id when _id is not provided', () => {
      const mutation = {
        create: {
          _type: 'movie',
          title: 'Inception',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      // Since no _id was given, getId returns crypto.randomUUID() which we stubbed to "fixed-uuid"
      expect(result['fixed-uuid']).toEqual({
        _id: 'fixed-uuid',
        _type: 'movie',
        title: 'Inception',
        _createdAt: timestamp,
        _updatedAt: timestamp,
        _rev: transactionId,
      })
      // Other documents remain intact
      expect(result['existingDoc']).toBeDefined()
    })

    it('should create a new document with the provided _id (if it does not end with ".") and honor user _createdAt/_updatedAt', () => {
      const mutation = {
        create: {
          _id: 'movie-1',
          _type: 'movie',
          title: 'Interstellar',
          _createdAt: '2021-01-01T00:00:00Z',
          _updatedAt: '2021-01-02T00:00:00Z',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['movie-1']).toEqual({
        _id: 'movie-1',
        _type: 'movie',
        title: 'Interstellar',
        _createdAt: '2021-01-01T00:00:00Z',
        _updatedAt: '2021-01-02T00:00:00Z',
        _rev: transactionId,
      })
    })

    it('should create a new document with an auto-generated suffix when _id ends with "."', () => {
      const mutation = {
        create: {
          _id: 'doc.',
          _type: 'note',
          content: 'Test note',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      // getId returns "doc." + "fixed-uuid"
      expect(result['doc.fixed-uuid']).toEqual({
        _id: 'doc.fixed-uuid',
        _type: 'note',
        content: 'Test note',
        _createdAt: timestamp,
        _updatedAt: timestamp,
        _rev: transactionId,
      })
    })

    it('should throw an error when trying to create a document with an existing _id', () => {
      const mutation = {
        create: {
          _id: 'existingDoc',
          _type: 'test',
          title: 'Duplicate',
        },
      }
      expect(() =>
        processMutations({documents: docs, mutations: [mutation], transactionId, timestamp}),
      ).toThrow(
        /Cannot create document with `_id` `existingDoc` because another document with the same ID already exists./,
      )
    })

    it('should use provided _createdAt and _updatedAt if present even if timestamp is provided', () => {
      const mutation = {
        create: {
          _type: 'test',
          title: 'Provided Times',
          _createdAt: '2022-05-05T00:00:00Z',
          _updatedAt: '2022-05-06T00:00:00Z',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['fixed-uuid']?._createdAt).toBe('2022-05-05T00:00:00Z')
      expect(result['fixed-uuid']?._updatedAt).toBe('2022-05-06T00:00:00Z')
    })

    it('should use timestamp as _createdAt and _updatedAt if not provided by user', () => {
      const mutation = {
        create: {
          _type: 'test',
          title: 'Default Now',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['fixed-uuid']?._createdAt).toBe(timestamp)
      expect(result['fixed-uuid']?._updatedAt).toBe(timestamp)
    })
  })

  describe('createIfNotExists mutation', () => {
    it('should create a document if it does not already exist', () => {
      const mutation = {
        createIfNotExists: {
          _id: 'newDoc',
          _type: 'test',
          title: 'Created',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['newDoc']).toEqual({
        _id: 'newDoc',
        _type: 'test',
        title: 'Created',
        _createdAt: timestamp,
        _updatedAt: timestamp,
        _rev: transactionId,
      })
    })

    it('should not overwrite an existing document', () => {
      const mutation = {
        createIfNotExists: {
          _id: 'existingDoc',
          _type: 'test',
          title: 'Should Not Replace',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['title']).toBe('Old Title')
    })

    it('should use user provided _createdAt and _updatedAt if provided', () => {
      const mutation = {
        createIfNotExists: {
          _id: 'userDoc',
          _type: 'test',
          title: 'User Provided',
          _createdAt: '2023-01-01T00:00:00Z',
          _updatedAt: '2023-01-01T00:00:00Z',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['userDoc']?._createdAt).toBe('2023-01-01T00:00:00Z')
      expect(result['userDoc']?._updatedAt).toBe('2023-01-01T00:00:00Z')
    })

    it('should default to timestamp when _createdAt and _updatedAt are not provided', () => {
      const mutation = {
        createIfNotExists: {
          _id: 'userDoc2',
          _type: 'test',
          title: 'Default Now',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['userDoc2']?._createdAt).toBe(timestamp)
      expect(result['userDoc2']?._updatedAt).toBe(timestamp)
    })
  })

  describe('createOrReplace mutation', () => {
    it('should create a new document if one does not exist, using provided _createdAt/_updatedAt if available', () => {
      const mutation = {
        createOrReplace: {
          _id: 'orReplaceNew',
          _type: 'test',
          title: 'New OR Replace',
          _createdAt: '2022-01-01T00:00:00Z',
          _updatedAt: '2022-01-02T00:00:00Z',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['orReplaceNew']).toEqual({
        _id: 'orReplaceNew',
        _type: 'test',
        title: 'New OR Replace',
        _createdAt: '2022-01-01T00:00:00Z',
        _updatedAt: '2022-01-02T00:00:00Z',
        _rev: transactionId,
      })
    })

    it('should replace an existing document while preserving its original _createdAt and updating _updatedAt', () => {
      const mutation = {
        createOrReplace: {
          _id: 'existingDoc',
          _type: 'test',
          title: 'Replaced Title',
          _createdAt: 'ignored-date',
          _updatedAt: 'ignored-date',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      // The original _createdAt from existingDoc is preserved.
      expect(result['existingDoc']?._createdAt).toBe('2020-01-01T00:00:00Z')
      expect(result['existingDoc']?._updatedAt).toBe(timestamp)
      expect(result['existingDoc']?.['title']).toBe('Replaced Title')
      expect(result['existingDoc']?._rev).toBe(transactionId)
    })

    it('should use timestamp as _createdAt and _updatedAt when not provided in createOrReplace for a new document', () => {
      const mutation = {
        createOrReplace: {
          _id: 'newReplace',
          _type: 'test',
          title: 'New Replace No Times',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['newReplace']?._createdAt).toBe(timestamp)
      expect(result['newReplace']?._updatedAt).toBe(timestamp)
    })
  })

  describe('delete mutation', () => {
    it('should delete a document (set its value to null)', () => {
      const mutation = {
        delete: {
          id: 'existingDoc',
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']).toBeNull()
    })

    it('should delete multiple documents when given an array of ids', () => {
      // Add one extra document
      docs['anotherDoc'] = {
        _id: 'anotherDoc',
        _type: 'test',
        _createdAt: '2020-01-01T00:00:00Z',
        _updatedAt: '2020-01-01T00:00:00Z',
        _rev: 'rev0',
        title: 'Another',
      }
      const mutations = ['existingDoc', 'anotherDoc', 'nonexistent'].map((id) => ({delete: {id}}))
      const result = processMutations({
        documents: docs,
        mutations,
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']).toBeNull()
      expect(result['anotherDoc']).toBeNull()
      // Even if "nonexistent" was not originally present, it is now set to null.
      expect(result['nonexistent']).toBeNull()
    })
  })

  describe('patch mutation', () => {
    it('should apply a set operation', () => {
      const mutation = {
        patch: {
          id: 'existingDoc',
          set: {title: 'Updated Title'},
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['title']).toBe('Updated Title')
      expect(result['existingDoc']?._rev).toBe(transactionId)
      expect(result['existingDoc']?._updatedAt).toBe(timestamp)
    })

    it('should apply a setIfMissing operation only when the field is missing', () => {
      // For a missing field:
      const mutation = {
        patch: {
          id: 'existingDoc',
          setIfMissing: {subtitle: 'Default Subtitle'},
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['subtitle']).toBe('Default Subtitle')

      // When the field already exists, it should not be overwritten.
      docs['existingDoc']!['subtitle'] = 'Already set'
      const result2 = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result2['existingDoc']?.['subtitle']).toBe('Already set')
    })

    it('should apply an unset operation', () => {
      const mutation = {
        patch: {
          id: 'existingDoc',
          unset: ['title'],
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['title']).toBeUndefined()
    })

    it('should apply an inc operation', () => {
      const mutation = {
        patch: {
          id: 'existingDoc',
          inc: {value: 5},
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['value']).toBe(15)
    })

    it('should apply a dec operation', () => {
      const mutation = {
        patch: {
          id: 'existingDoc',
          dec: {value: 3},
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['value']).toBe(7)
    })

    it('should apply a diffMatchPatch operation', () => {
      const patchStr = '@@ -13,7 +13,7 @@\n own \n-fox\n+cat\n'
      const mutation = {
        patch: {
          id: 'existingDoc',
          diffMatchPatch: {description: patchStr},
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['description']).toBe('the quick brown cat')
    })

    it('should apply an insert operation with "before"', () => {
      const mutation = {
        patch: {
          id: 'existingDoc',
          insert: {before: 'arrayField[1]', items: ['x']},
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['arrayField']).toEqual(['a', 'x', 'b', 'c'])
    })

    it('should apply an insert operation with "after"', () => {
      const mutation = {
        patch: {
          id: 'existingDoc',
          insert: {after: 'arrayField[1]', items: ['y']},
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['arrayField']).toEqual(['a', 'b', 'y', 'c'])
    })

    it('should apply an insert operation with "replace"', () => {
      const mutation = {
        patch: {
          id: 'existingDoc',
          insert: {replace: 'arrayField[1]', items: ['z']},
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['arrayField']).toEqual(['a', 'z', 'c'])
    })

    it('should apply an ifRevisionID operation that succeeds', () => {
      const mutation = {
        patch: {
          id: 'existingDoc',
          ifRevisionID: 'rev0',
          set: {title: 'Revision OK'},
        },
      }
      const result = processMutations({
        documents: docs,
        mutations: [mutation],
        transactionId,
        timestamp,
      })
      expect(result['existingDoc']?.['title']).toBe('Revision OK')
    })

    it('should throw an error if patch is applied to a non-existent document', () => {
      const mutation = {
        patch: {
          id: 'nonexistent',
          set: {foo: 'bar'},
        },
      }
      expect(() =>
        processMutations({documents: docs, mutations: [mutation], transactionId, timestamp}),
      ).toThrow(/Cannot patch document with ID `nonexistent` because it was not found/)
    })

    it('should throw an error when ifRevisionID does not match', () => {
      const mutation = {
        patch: {
          id: 'existingDoc',
          ifRevisionID: 'wrong-rev',
          set: {title: 'Should Fail'},
        },
      }
      expect(() =>
        processMutations({documents: docs, mutations: [mutation], transactionId, timestamp}),
      ).toThrow(/does not match document's revision ID/)
    })
  })

  describe('default now value', () => {
    it('should default to current time when timestamp is not provided', () => {
      // Use fake timers to control the current time
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))
      const mutation = {create: {_type: 'test', title: 'No Timestamp'}}
      const result = processMutations({documents: docs, mutations: [mutation], transactionId})
      expect(result['fixed-uuid']?._createdAt).toBe('2000-01-01T00:00:00.000Z')
      expect(result['fixed-uuid']?._updatedAt).toBe('2000-01-01T00:00:00.000Z')
      vi.useRealTimers()
    })
  })

  describe('empty mutations array', () => {
    it('should return the input documents if there are no mutations', () => {
      const result = processMutations({
        documents: docs,
        mutations: [],
        transactionId,
        timestamp,
      })
      expect(result).toBe(docs)
    })
  })
})
