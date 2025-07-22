import {describe, expect, it} from 'vitest'

import {version} from './version.js'

describe('version', () => {
  it('should be a string', () => {
    expect(typeof version).toBe('string')
  })
})
