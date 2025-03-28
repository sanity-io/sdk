import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {resolveProjects} from './projects'

vi.mock('../client/clientStore')

describe('projects', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('calls the `client.observable.projects.list` method on the client and returns the result', async () => {
    const projects = [{id: 'a'}, {id: 'b'}]
    const list = vi.fn().mockReturnValue(of(projects))

    const mockClient = {
      observable: {
        projects: {list} as unknown as SanityClient['observable']['projects'],
      },
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    const result = await resolveProjects(instance)
    expect(result).toEqual(projects)
    expect(list).toHaveBeenCalledWith({includeMembers: false})
  })
})
