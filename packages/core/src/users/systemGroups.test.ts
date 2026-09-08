import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {systemGroups} from './systemGroups'

vi.mock('../client/clientStore')

describe('systemGroups', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  const mockFetch = (fetch: ReturnType<typeof vi.fn>) => {
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {fetch}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  }

  it('reads the access groups from the requested dataset', async () => {
    const groups = [{members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]}]
    const fetch = vi.fn().mockReturnValue(of(groups))
    mockFetch(fetch)

    const result = await systemGroups.resolveState(instance, {projectId: 'p', dataset: 'd'})

    expect(result).toEqual(groups)
    expect(fetch).toHaveBeenCalledWith(
      '*[_type == "system.group"]{members, grants}',
      {},
      expect.objectContaining({perspective: 'raw', tag: 'users.system-groups'}),
    )
    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({resource: {projectId: 'p', dataset: 'd'}}),
    )
  })

  it('caches per dataset', async () => {
    const fetch = vi.fn().mockReturnValue(of([]))
    mockFetch(fetch)

    await systemGroups.resolveState(instance, {projectId: 'p', dataset: 'd'})
    await systemGroups.resolveState(instance, {projectId: 'p', dataset: 'd'})
    expect(fetch).toHaveBeenCalledTimes(1)

    await systemGroups.resolveState(instance, {projectId: 'p', dataset: 'staging'})
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
