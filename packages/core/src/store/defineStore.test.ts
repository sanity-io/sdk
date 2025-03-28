import {describe, expect, it} from 'vitest'

import {type SanityInstance} from './createSanityInstance'
import {defineStore, type StoreDefinition} from './defineStore'

describe('defineStore', () => {
  it('should return the store definition unchanged', () => {
    const storeDef: StoreDefinition<number> = {
      name: 'TestStore',
      getInitialState: () => 42,
    }

    const result = defineStore(storeDef)
    expect(result).toBe(storeDef)
    expect(result.name).toBe('TestStore')
    expect(result.getInitialState({} as SanityInstance)).toBe(42)
  })
})
