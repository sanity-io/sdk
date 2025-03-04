import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {describe, it} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance} from '../instance/sanityInstance'
import {type StateSource} from '../resources/createStateSourceAction'
import {resolveProject} from './project'

vi.mock('../client/clientStore')

describe('project', () => {
  it('calls the `client.observable.projects.getById` method on the client and returns the result', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    const project = {id: 'a'}
    const getById = vi.fn().mockReturnValue(of(project))

    const mockClient = {
      observable: {
        projects: {getById} as unknown as SanityClient['observable']['projects'],
      },
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    const result = await resolveProject(instance, 'a')
    expect(result).toEqual(project)
    expect(getById).toHaveBeenCalledWith('a')
  })
})
