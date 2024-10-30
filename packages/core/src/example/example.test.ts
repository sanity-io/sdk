import {describe, expect, it} from 'vitest'

import {testFunction} from './example'

describe('testFunction', () => {
  it('should return "example"', () => {
    const result = testFunction()
    expect(result).toBe('example')
  })
})
