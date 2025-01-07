import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import type {SanityInstance} from '../../../instance/types'
import {getOrCreateResource} from '../../../resources/createResource'
import {comlinkControllerStore} from '../comlinkControllerStore'
import {createChannel} from './createChannel'
import {createController} from './createController'
import {removeChannel} from './removeChannel'

describe('removeChannel', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
    vi.clearAllMocks()
  })

  it('should remove channel from store', () => {
    createController(instance, 'https://test.sanity.dev')
    createChannel(instance, {
      name: 'test',
      connectTo: 'iframe',
    })

    removeChannel(instance, 'test')
    const store = getOrCreateResource(instance, comlinkControllerStore)

    expect(store.state.get().channels.has('test')).toBe(false)
  })

  it('should do nothing if channel does not exist', () => {
    expect(() => removeChannel(instance, 'nonexistent')).not.toThrow()
  })
})
