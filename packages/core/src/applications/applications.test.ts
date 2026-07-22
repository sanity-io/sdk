import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {defineMutation} from '../store/fetcherStore'
import {application, applications} from './applications'

vi.mock('../client/clientStore')

describe('applications', () => {
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

  it('lists applications for an organization, serialising include as a sorted CSV', async () => {
    const response = {nextCursor: null, data: [{id: 'app1'}]}
    request.mockReturnValue(of(response))

    const result = await applications.resolveState(instance, {
      organizationId: 'org1',
      include: ['workspaces', 'access'],
      limit: 'none',
    })

    expect(result).toEqual(response)
    expect(getClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      scope: 'global',
    })
    expect(request).toHaveBeenCalledWith({
      uri: '/applications',
      query: {organizationId: 'org1', include: 'access,workspaces', limit: 'none'},
      tag: 'applications.list',
    })
  })

  it('fetches a single application by id', async () => {
    const app = {id: 'app1', title: 'One'}
    request.mockReturnValue(of(app))

    const result = await application.resolveState(instance, 'app1')

    expect(result).toEqual(app)
    expect(request).toHaveBeenCalledWith({
      uri: '/applications/app1',
      query: {},
      tag: 'applications.get',
    })
  })

  it('refetches the list when a mutation invalidates the LIST tag', async () => {
    let n = 0
    request.mockImplementation(() => of({nextCursor: null, data: [{id: `app-${++n}`}]}))

    const source = applications.getState(instance, {organizationId: 'org1'})
    const unsubscribe = source.subscribe()
    await vi.waitFor(() => expect(source.getCurrent().status).toBe('success'))
    expect(request).toHaveBeenCalledTimes(1)

    const install = defineMutation<undefined, {ok: boolean}>({
      name: 'test-install-application',
      mutationFn: () => () => of({ok: true}),
      invalidates: [{type: 'application', id: 'LIST'}],
    })

    const {invalidated} = await install(instance, undefined)
    await invalidated

    expect(request).toHaveBeenCalledTimes(2)
    expect(source.getCurrent().data).toEqual({nextCursor: null, data: [{id: 'app-2'}]})
    unsubscribe()
  })
})
