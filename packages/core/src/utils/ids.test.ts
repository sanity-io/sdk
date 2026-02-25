import {describe, expect, it} from 'vitest'

import {insecureRandomId} from './ids'

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
