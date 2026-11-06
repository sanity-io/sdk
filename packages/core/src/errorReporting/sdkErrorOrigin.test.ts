import {describe, expect, it} from 'vitest'

import {findSdkErrorInChain, isSdkError, markSdkError} from './sdkErrorOrigin'

describe('markSdkError', () => {
  it('marks an error without adding an enumerable key', () => {
    const error = new Error('sdk')
    markSdkError(error)
    expect(isSdkError(error)).toBe(true)
    expect(Object.keys(error)).toEqual([])
    expect({...error}).toEqual({})
  })

  it('ignores values that are not errors', () => {
    const promise = Promise.resolve()
    markSdkError(promise)
    markSdkError('text')
    expect(isSdkError(promise)).toBe(false)
  })

  it('can be called twice on the same error', () => {
    const error = new Error('sdk')
    markSdkError(error)
    expect(() => markSdkError(error)).not.toThrow()
    expect(isSdkError(error)).toBe(true)
  })

  it('leaves a frozen error unmarked without throwing', () => {
    const error = Object.freeze(new Error('frozen'))
    expect(() => markSdkError(error)).not.toThrow()
    expect(isSdkError(error)).toBe(false)
  })
})

describe('isSdkError', () => {
  it('reads a mark set by another copy of the SDK', () => {
    const error = new Error('other copy')
    Object.defineProperty(error, Symbol.for('@sanity/sdk/errorOrigin'), {value: true})
    expect(isSdkError(error)).toBe(true)
  })
})

describe('findSdkErrorInChain', () => {
  it('returns a marked cause', () => {
    const cause = new Error('sdk')
    markSdkError(cause)
    expect(findSdkErrorInChain(new Error('app', {cause}))).toBe(cause)
  })

  it('returns false when no error in the chain is marked', () => {
    expect(findSdkErrorInChain(new Error('app', {cause: new Error('root')}))).toBeUndefined()
  })

  it('stops on a cyclic cause chain', () => {
    const a = new Error('a')
    a.cause = new Error('b', {cause: a})
    expect(findSdkErrorInChain(a)).toBeUndefined()
  })

  it('returns false when a cause getter throws', () => {
    const error = new Error('hostile')
    Object.defineProperty(error, 'cause', {
      get() {
        throw new Error('getter')
      },
    })
    expect(findSdkErrorInChain(error)).toBeUndefined()
  })

  it('stops after five errors', () => {
    const root = new Error('root')
    markSdkError(root)
    let top = root
    for (let level = 0; level < 5; level++) top = new Error(`level ${level}`, {cause: top})
    expect(findSdkErrorInChain(top)).toBeUndefined()
    expect(findSdkErrorInChain(top.cause)).toBe(root)
  })
})
