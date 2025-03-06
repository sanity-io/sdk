import {describe, expect, it} from 'vitest'

import {validateProjection} from './util'

describe('validateProjection', () => {
  it('accepts valid projections with curly braces', () => {
    expect(validateProjection('{title, name}')).toBe('{title, name}')
    expect(validateProjection('{title, "author": author.name}')).toBe(
      '{title, "author": author.name}',
    )
    expect(validateProjection('{title, body, "nested": {foo, bar}}')).toBe(
      '{title, body, "nested": {foo, bar}}',
    )
    expect(validateProjection('{title, "excerpt": pt::text(body)}')).toBe(
      '{title, "excerpt": pt::text(body)}',
    )
  })

  it('throws error for projections without opening brace', () => {
    expect(() => validateProjection('title, name}')).toThrow(/Invalid projection format/)
  })

  it('throws error for projections without closing brace', () => {
    expect(() => validateProjection('{title, name')).toThrow(/Invalid projection format/)
  })

  it('throws error for projections without any braces', () => {
    expect(() => validateProjection('title, name')).toThrow(/Invalid projection format/)
  })

  it('throws error for empty string', () => {
    expect(() => validateProjection('')).toThrow(/Invalid projection format/)
  })

  it('provides helpful error message', () => {
    try {
      validateProjection('title, name')
    } catch (err) {
      const error = err as Error
      expect(error.message).toContain('must be enclosed in curly braces')
      expect(error.message).toContain('e.g.')
    }
  })
})
