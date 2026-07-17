import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {userApplication, userApplications} from './userApplications'

vi.mock('../client/clientStore')

describe('userApplications', () => {
  let instance: SanityInstance
  const request = vi.fn()

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    request.mockReset()
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => {
    instance.dispose()
  })

  it('lists user applications for an organization on the global client', async () => {
    const apps = [{id: 'ua1'}, {id: 'ua2'}]
    request.mockReturnValue(of(apps))

    const result = await userApplications.resolveState(instance, {organizationId: 'org1'})

    expect(result).toEqual(apps)
    expect(getClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'v2024-08-01',
      scope: 'global',
    })
    expect(request).toHaveBeenCalledWith({
      uri: '/user-applications',
      query: {organizationId: 'org1'},
      tag: 'user-applications.list',
    })
  })

  it('fetches a single user application by id', async () => {
    const app = {id: 'ua1', appHost: 'my-studio'}
    request.mockReturnValue(of(app))

    const result = await userApplication.resolveState(instance, 'ua1')

    expect(result).toEqual(app)
    expect(request).toHaveBeenCalledWith({
      uri: '/user-applications/ua1',
      tag: 'user-applications.get',
    })
  })
})
