import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {describe, it} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {resolveDatasets} from './datasets'

vi.mock('../client/clientStore')

describe('datasets', () => {
  it('calls the `client.observable.datasets.list` method on the client and returns the result', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const datasets = [{id: 'a'}, {id: 'b'}]
    const list = vi.fn().mockReturnValue(of(datasets))

    const mockClient = {
      observable: {
        datasets: {list} as unknown as SanityClient['observable']['datasets'],
      },
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    const result = await resolveDatasets(instance)
    expect(result).toEqual(datasets)
    expect(list).toHaveBeenCalled()
  })
})
