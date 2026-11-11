import {describe, expect, it} from 'vitest'

import {lookUpKey} from './registry'

describe('lookUpKey', () => {
  it('finds a key the API names in full', () => {
    expect(lookUpKey('studio.structure-tool.inspect-view-mode')).toEqual({
      resourceType: 'project',
      defaultValue: 'parsed',
    })
  })

  it('finds a key by the part the API names, whatever follows it', () => {
    expect(lookUpKey('studio.structure-tool.layout.book')).toEqual({
      resourceType: 'project',
      defaultValue: 'default',
    })
  })

  it("doesn't match a key that stops where its `{part}` should be", () => {
    expect(() => lookUpKey('studio.structure-tool.layout.')).toThrow(
      expect.objectContaining({code: 'keyNotDeclared'}),
    )
  })

  it("fails with keyNotDeclared for a key the SDK doesn't know", () => {
    expect(() => lookUpKey('studio.unknown')).toThrow(
      expect.objectContaining({code: 'keyNotDeclared'}),
    )
  })
})
