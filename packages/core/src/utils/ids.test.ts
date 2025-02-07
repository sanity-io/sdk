import {describe, expect, it} from 'vitest'

import {getDraftId, getPublishedId, insecureRandomId} from './ids'

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

describe('insecureRandomId', () => {
  it('should generate 16-character string', () => {
    expect(insecureRandomId()).toHaveLength(16)
  })

  it('should generate hex string', () => {
    expect(insecureRandomId()).toMatch(/^[0-9a-f]{16}$/)
  })

  it('should generate different ids on each call', () => {
    const id1 = insecureRandomId()
    const id2 = insecureRandomId()
    expect(id1).not.toBe(id2)
  })

  it('should generate properly formatted strings multiple times', () => {
    for (let i = 0; i < 100; i++) {
      const id = insecureRandomId()
      expect(id).toMatch(/^[0-9a-f]{16}$/)
    }
  })
})
