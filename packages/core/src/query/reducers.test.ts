import {describe, expect, it} from 'vitest'

import {
  addSubscriber,
  cancelQuery,
  initializeQuery,
  type QueryStoreState,
  removeSubscriber,
  setLastLiveEventId,
  setQueryData,
  setQueryError,
} from './reducers'

describe('Query Reducers', () => {
  describe('setQueryError', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: QueryStoreState = {queries: {}}
      const reducer = setQueryError('nonexistent', 'Error occurred')
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should set error if key exists', () => {
      const state: QueryStoreState = {queries: {q1: {subscribers: []}}}
      const reducer = setQueryError('q1', 'Error occurred')
      const newState = reducer(state)
      expect(newState.queries['q1']).toEqual({subscribers: [], error: 'Error occurred'})
    })
  })

  describe('setQueryData', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: QueryStoreState = {queries: {}}
      const reducer = setQueryData('nonexistent', {foo: 'bar'}, ['tag1'])
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should set result and syncTags if key exists', () => {
      const state: QueryStoreState = {queries: {q2: {subscribers: []}}}
      const reducer = setQueryData('q2', {foo: 'bar'}, ['tag1', 'tag2'])
      const newState = reducer(state)
      expect(newState.queries['q2']).toEqual({
        subscribers: [],
        result: {foo: 'bar'},
        syncTags: ['tag1', 'tag2'],
      })
    })

    it('should set result to null if result is undefined', () => {
      const state: QueryStoreState = {queries: {q3: {subscribers: []}}}
      const reducer = setQueryData('q3', undefined, ['tag'])
      const newState = reducer(state)
      expect(newState.queries['q3']).toEqual({subscribers: [], result: null, syncTags: ['tag']})
    })
  })

  describe('setLastLiveEventId', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: QueryStoreState = {queries: {}}
      const reducer = setLastLiveEventId('nonexistent', 'live123')
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should set lastLiveEventId if key exists', () => {
      const state: QueryStoreState = {queries: {q4: {subscribers: []}}}
      const reducer = setLastLiveEventId('q4', 'event99')
      const newState = reducer(state)
      expect(newState.queries['q4']).toEqual({subscribers: [], lastLiveEventId: 'event99'})
    })
  })

  describe('addSubscriber', () => {
    it('should add subscriber when key does not exist', () => {
      const state: QueryStoreState = {queries: {}}
      const reducer = addSubscriber('q5', 'sub1')
      const newState = reducer(state)
      expect(newState.queries['q5']).toEqual({subscribers: ['sub1']})
    })

    it('should append subscriber when key exists', () => {
      const state: QueryStoreState = {queries: {q6: {subscribers: ['subA']}}}
      const reducer = addSubscriber('q6', 'subB')
      const newState = reducer(state)
      expect(newState.queries['q6']).toEqual({subscribers: ['subA', 'subB']})
    })
  })

  describe('removeSubscriber', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: QueryStoreState = {queries: {}}
      const reducer = removeSubscriber('nonexistent', 'subX')
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should remove subscriber and keep the query if other subscribers remain', () => {
      const state: QueryStoreState = {queries: {q7: {subscribers: ['sub1', 'sub2']}}}
      const reducer = removeSubscriber('q7', 'sub1')
      const newState = reducer(state)
      expect(newState.queries['q7']).toEqual({subscribers: ['sub2']})
    })

    it('should remove the query if no subscribers remain after removal', () => {
      const state: QueryStoreState = {queries: {q8: {subscribers: ['onlySub']}}}
      const reducer = removeSubscriber('q8', 'onlySub')
      const newState = reducer(state)
      expect(newState.queries).not.toHaveProperty('q8')
    })
  })

  describe('cancelQuery', () => {
    it('should return state unchanged if key does not exist', () => {
      const state: QueryStoreState = {queries: {}}
      const reducer = cancelQuery('nonexistent')
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should return state unchanged if query has subscribers', () => {
      const state: QueryStoreState = {queries: {q9: {subscribers: ['sub1']}}}
      const reducer = cancelQuery('q9')
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should remove the query if no subscribers exist', () => {
      const state: QueryStoreState = {queries: {q10: {subscribers: []}}}
      const reducer = cancelQuery('q10')
      const newState = reducer(state)
      expect(newState.queries).not.toHaveProperty('q10')
    })
  })

  describe('initializeQuery', () => {
    it('should return state unchanged if query already exists', () => {
      const existing = {subscribers: ['sub1']}
      const state: QueryStoreState = {queries: {q11: existing}}
      const reducer = initializeQuery('q11')
      const newState = reducer(state)
      expect(newState).toBe(state)
    })

    it('should add the query with empty subscribers if it does not exist', () => {
      const state: QueryStoreState = {queries: {}}
      const reducer = initializeQuery('q12')
      const newState = reducer(state)
      expect(newState.queries['q12']).toEqual({subscribers: []})
    })
  })
})
