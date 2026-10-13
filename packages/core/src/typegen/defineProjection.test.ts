import {describe, expect, expectTypeOf, it} from 'vitest'

import {defineProjection} from './defineProjection'

describe('defineProjection', () => {
  it('returns the projection unchanged', () => {
    const projection = '{name, "awardCount": count(awards)}'
    expect(defineProjection(projection)).toBe(projection)
    expectTypeOf(defineProjection(projection)).toEqualTypeOf<typeof projection>()
  })

  it('returns the projection, not the document type, when both are passed', () => {
    const projection = '{name, "awardCount": count(awards)}'
    expect(defineProjection('author', projection)).toBe(projection)
    expectTypeOf(defineProjection('author', projection)).toEqualTypeOf<typeof projection>()
  })

  it('preserves whitespace used in existing generated projection keys', () => {
    const projection = '{\n  name,\n  role\n}'
    expect(defineProjection(projection)).toBe(projection)
    expectTypeOf(defineProjection(projection)).toEqualTypeOf<typeof projection>()
  })
})
