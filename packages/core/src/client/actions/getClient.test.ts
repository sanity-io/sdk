import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {getTokenState} from '../../auth/authStore'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {type ClientOptions, getClient} from './getClient'

vi.mock('../../auth/authStore', async (importOriginal) => {
  const original = importOriginal<typeof import('../../auth/authStore')>()
  return {
    ...original,
    getTokenState: vi.fn().mockReturnValue({
      observable: new Subject<string | null>(),
    }),
  }
})

describe('getClient', () => {
  const apiVersion = '2024-01-01'

  let instance: SanityInstance
  let tokenSubject: Subject<string | null>

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance(config)

    // @ts-expect-error no params required since mocking
    const tokenState = getTokenState()
    tokenSubject = tokenState.observable as Subject<string | null>
  })

  it('throws error when apiVersion is missing', () => {
    expect(() => getClient(instance, {} as ClientOptions)).toThrow(
      'Missing required `apiVersion` option',
    )
  })

  it('creates new client with correct apiVersion', () => {
    const result = getClient(instance, {apiVersion})
    expect(result.config().apiVersion).toBe(apiVersion)
  })

  it('reuses existing client for same apiVersion', () => {
    const result1 = getClient(instance, {apiVersion})
    const result2 = getClient(instance, {apiVersion})
    expect(result1).toBe(result2)
  })

  it('preserves client identity after token update', async () => {
    const client1 = getClient(instance, {apiVersion})

    tokenSubject.next('new-token')

    const client2 = getClient(instance, {apiVersion})

    expect(client2.config().token).toBe('new-token')
    expect(client2.config().apiVersion).toBe(apiVersion)
    expect(client2).not.toBe(client1)
    expect(client1.config().token).toBeUndefined()
  })
})
