import {describe, expect, it} from 'vitest'

import {defineProjection} from './defineProjection'

describe('defineProjection', () => {
  it('returns the projection unchanged', () => {
    const projection = '{name, "awardCount": count(awards)}'
    expect(defineProjection(projection)).toBe(projection)
  })

  it('does not alter whitespace, which the scanner matches on', () => {
    const projection = '{\n  name,\n  role\n}'
    expect(defineProjection(projection)).toBe(projection)
  })
})
