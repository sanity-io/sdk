import {describe, expect, it} from 'vitest'

import {buildQuery} from './buildQuery'

describe('buildQuery', () => {
  it('stringifies scalars, drops undefined, and passes string arrays through', () => {
    expect(buildQuery({a: true, b: 0, c: 'x', d: undefined, e: ['p', 'q']})).toEqual({
      a: 'true',
      b: '0',
      c: 'x',
      e: ['p', 'q'],
    })
  })
})
