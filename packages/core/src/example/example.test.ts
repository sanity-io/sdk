import {describe, expect, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {testFunction} from './example'

describe('testFunction', () => {
  it('should return "example"', () => {
    const result = testFunction()
    expect(result).toBe('example')
  })
  it('should return "example" with sanityInstance', () => {
    const sanityInstance = createSanityInstance({
      projectId: 'ppsg7ml5',
      dataset: 'test',
    })
    const result = testFunction(sanityInstance)
    expect(result).toBe('example')
  })
})
