import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {datasets} from './datasets'

vi.mock('../client/clientStore')

describe('datasets', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  const mockClientWithList = (list: ReturnType<typeof vi.fn>) => {
    const mockClient = {
      observable: {
        datasets: {list} as unknown as SanityClient['observable']['datasets'],
      },
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)
  }

  it('calls the `client.observable.datasets.list` method on the client and returns the result', async () => {
    const list = vi.fn().mockReturnValue(of([{id: 'a'}, {id: 'b'}]))
    mockClientWithList(list)

    const result = await datasets.resolveState(instance)
    expect(result).toEqual([{id: 'a'}, {id: 'b'}])
    expect(list).toHaveBeenCalled()
    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({projectId: 'p', useProjectHostname: true}),
    )
  })

  it('reads datasets for an explicit projectId over the instance config', async () => {
    const list = vi.fn().mockReturnValue(of([]))
    mockClientWithList(list)

    await datasets.resolveState(instance, {projectId: 'other'})
    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({projectId: 'other'}),
    )
  })

  it('rejects when no projectId can be resolved', async () => {
    const bare = createSanityInstance({})
    // async wrapper: the missing-projectId error is thrown synchronously from getKey
    await expect(async () => datasets.resolveState(bare)).rejects.toThrow(
      'A projectId is required to use the datasets API.',
    )
    bare.dispose()
  })
})
