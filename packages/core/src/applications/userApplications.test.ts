import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {
  createUserApplication,
  deleteUserApplication,
  updateUserApplication,
  userApplication,
  userApplications,
} from './userApplications'

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

  it('creates a user application, sending query params and body, and refetches the list', async () => {
    request.mockImplementation((opts) => {
      const {method} = opts as {method?: string}
      return method === 'POST' ? of({id: 'ua-new', title: 'New'}) : of([{id: 'ua-new'}])
    })

    const source = userApplications.getState(instance, {organizationId: 'org1'})
    const unsubscribe = source.subscribe()
    await vi.waitFor(() => expect(source.getCurrent().status).toBe('success'))

    const {data, invalidated} = await createUserApplication(instance, {
      organizationId: 'org1',
      appType: 'studio',
      urlType: 'internal',
      appHost: 'my-studio',
      title: 'New',
    })
    await invalidated

    expect(data).toEqual({id: 'ua-new', title: 'New'})
    expect(request).toHaveBeenCalledWith({
      uri: '/user-applications',
      method: 'POST',
      query: {organizationId: 'org1', appType: 'studio'},
      body: {urlType: 'internal', appHost: 'my-studio', title: 'New'},
      tag: 'user-applications.create',
    })
    // initial list GET + POST + list refetch after invalidation
    expect(request).toHaveBeenCalledTimes(3)
    unsubscribe()
  })

  it('updates a user application via PATCH', async () => {
    request.mockReturnValue(of({id: 'ua1', title: 'Renamed'}))

    const {data} = await updateUserApplication(instance, {
      userApplicationId: 'ua1',
      title: 'Renamed',
    })

    expect(data).toEqual({id: 'ua1', title: 'Renamed'})
    expect(request).toHaveBeenCalledWith({
      uri: '/user-applications/ua1',
      method: 'PATCH',
      body: {title: 'Renamed'},
      tag: 'user-applications.update',
    })
  })

  it('deletes a user application via DELETE with no body', async () => {
    request.mockReturnValue(of({deleted: true}))

    const {data} = await deleteUserApplication(instance, {userApplicationId: 'ua1'})

    expect(data).toEqual({deleted: true})
    expect(request).toHaveBeenCalledWith({
      uri: '/user-applications/ua1',
      method: 'DELETE',
      tag: 'user-applications.delete',
    })
  })
})
