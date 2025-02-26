import {type SanityClient} from '@sanity/client'
import {of, ReplaySubject} from 'rxjs'
import {describe, it} from 'vitest'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createSanityInstance} from '../instance/sanityInstance'
import {resolveProject} from './project'

vi.mock('../client/actions/getSubscribableClient', () => ({
  getSubscribableClient: vi.fn().mockReturnValue(new ReplaySubject(1)),
}))

describe('project', () => {
  it('calls the `client.observable.projects.getById` method on the client and returns the result', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const client$ = getSubscribableClient(instance, {apiVersion: ''}) as ReplaySubject<SanityClient>
    const project = {id: 'a'}

    const getById = vi.fn().mockReturnValue(of(project))
    client$.next({
      observable: {
        projects: {getById} as unknown as SanityClient['observable']['projects'],
      },
    } as SanityClient)

    const result = await resolveProject(instance, 'a')
    expect(result).toEqual(project)
    expect(getById).toHaveBeenCalledWith('a')
  })
})
