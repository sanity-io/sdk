import {describe, expect, it} from 'vitest'

import {hashString} from './hashString'

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
