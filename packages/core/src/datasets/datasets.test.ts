import {type SanityClient} from '@sanity/client'
import {of, ReplaySubject} from 'rxjs'
import {describe, it} from 'vitest'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createSanityInstance} from '../instance/sanityInstance'
import {resolveDatasets} from './datasets'

vi.mock('../client/actions/getSubscribableClient', () => ({
  getSubscribableClient: vi.fn().mockReturnValue(new ReplaySubject(1)),
}))

describe('datasets', () => {
  it('calls the `client.observable.datasets.list` method on the client and returns the result', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const client$ = getSubscribableClient(instance, {apiVersion: ''}) as ReplaySubject<SanityClient>
    const datasets = [{name: 'production'}, {name: 'staging'}]

    const list = vi.fn().mockReturnValue(of(datasets))
    client$.next({
      observable: {
        datasets: {list} as unknown as SanityClient['observable']['datasets'],
      },
    } as SanityClient)

    const result = await resolveDatasets(instance)
    expect(result).toEqual(datasets)
  })
})
