import {beforeEach, describe, expect, test} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getGlobalClient} from './getGlobalClient'

describe('getGlobalClient', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  test('returns the default client from the store', () => {
    const client = getGlobalClient(instance)
    expect(client.config().apiVersion).toBe('X')
    expect(client.config().useProjectHostname).toBe(false)
    expect(client.config().apiHost).toBe('https://api.sanity.io')
  })

  test('returns the same client instance on subsequent calls', () => {
    const client1 = getGlobalClient(instance)
    const client2 = getGlobalClient(instance)
    expect(client1).toBe(client2)
  })
})
