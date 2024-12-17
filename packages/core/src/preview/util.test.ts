import {describe, expect, it} from 'vitest'

import {getDraftId, getPublishedId, hashString, randomId} from './util'

describe('getDraftId', () => {
  it('should add drafts prefix to non-draft ids', () => {
    expect(getDraftId('abc123')).toBe('drafts.abc123')
  })

  it('should not modify ids that already have drafts prefix', () => {
    expect(getDraftId('drafts.abc123')).toBe('drafts.abc123')
  })

  it('should handle empty string', () => {
    expect(getDraftId('')).toBe('drafts.')
  })
})

describe('getPublishedId', () => {
  it('should remove drafts prefix from draft ids', () => {
    expect(getPublishedId('drafts.abc123')).toBe('abc123')
  })

  it('should not modify ids that dont have drafts prefix', () => {
    expect(getPublishedId('abc123')).toBe('abc123')
  })

  it('should handle empty string', () => {
    expect(getPublishedId('')).toBe('')
  })
})

describe('hashString', () => {
  it('should generate consistent hashes for the same input', () => {
    const input = 'test string'
    expect(hashString(input)).toBe(hashString(input))
  })

  it('should generate different hashes for different inputs', () => {
    expect(hashString('test1')).not.toBe(hashString('test2'))
  })

  it('should handle empty string', () => {
    expect(hashString('')).toBe('00000000')
  })

  it('should generate 8-character hex string', () => {
    const hash = hashString('test')
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('should handle long strings', () => {
    const longString = 'a'.repeat(1000)
    expect(hashString(longString)).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('randomId', () => {
  it('should generate 16-character string', () => {
    expect(randomId()).toHaveLength(16)
  })

  it('should generate hex string', () => {
    expect(randomId()).toMatch(/^[0-9a-f]{16}$/)
  })

  it('should generate different ids on each call', () => {
    const id1 = randomId()
    const id2 = randomId()
    expect(id1).not.toBe(id2)
  })

  it('should generate properly formatted strings multiple times', () => {
    for (let i = 0; i < 100; i++) {
      const id = randomId()
      expect(id).toMatch(/^[0-9a-f]{16}$/)
    }
  })
})
