import {type SanityClient} from '@sanity/client'
import {of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {defineMutation} from '../store/fetcherStore'
import {application, applications, deleteApplication, updateApplication} from './applications'

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

    expect(result).toEqual([response])
    expect(getClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      scope: 'global',
    })
    expect(request).toHaveBeenCalledWith({
      url: '/applications',
      query: {organizationId: 'org1', include: 'access,workspaces', limit: 'none'},
      tag: 'applications.list',
    })
  })

  it('reads the next page with the cursor the one before returned, keeping the filters', async () => {
    request
      .mockReturnValueOnce(of({nextCursor: 'c1', data: [{id: 'app1'}]}))
      .mockReturnValueOnce(of({nextCursor: null, data: [{id: 'app2'}]}))
    const options = {organizationId: 'org1', type: 'studio', limit: 1}
    await applications.resolveState(instance, options)

    const pages = await applications.loadMore(instance, options)

    expect(pages.flatMap(({data}) => data)).toEqual([{id: 'app1'}, {id: 'app2'}])
    expect(request).toHaveBeenLastCalledWith({
      url: '/applications',
      query: {organizationId: 'org1', type: 'studio', limit: '1', cursor: 'c1'},
      tag: 'applications.list',
    })
  })

  it('starts from the cursor the app passes, then loads more from the page it read', async () => {
    request
      .mockReturnValueOnce(of({nextCursor: 'c2', data: [{id: 'app2'}]}))
      .mockReturnValueOnce(of({nextCursor: null, data: [{id: 'app3'}]}))
    const options = {organizationId: 'org1', cursor: 'c1'}
    await applications.resolveState(instance, options)

    await applications.loadMore(instance, options)

    expect(request.mock.calls.map(([{query}]) => query.cursor)).toEqual(['c1', 'c2'])
  })

  it('refetches the list when a mutation invalidates an application on a page loaded after the first', async () => {
    request.mockImplementation(({query}) =>
      of(
        query.cursor
          ? {nextCursor: null, data: [{id: 'app2'}]}
          : {nextCursor: 'c1', data: [{id: 'app1'}]},
      ),
    )
    const source = applications.getState(instance, {organizationId: 'org1'})
    onTestFinished(source.subscribe())
    await vi.waitFor(() => expect(source.getCurrent().status).toBe('success'))
    await applications.loadMore(instance, {organizationId: 'org1'})
    request.mockClear()

    const change = defineMutation<undefined, {ok: boolean}>({
      name: 'test-change-application',
      mutationFn: () => () => of({ok: true}),
      invalidates: [{type: 'application', id: 'app2'}],
    })
    const {invalidated} = await change(instance, undefined)
    await invalidated

    expect(request).toHaveBeenCalledTimes(2)
  })

  it('fetches a single application by id', async () => {
    const app = {id: 'app1', title: 'One'}
    request.mockReturnValue(of(app))

    const result = await application.resolveState(instance, 'app1')

    expect(result).toEqual(app)
    expect(request).toHaveBeenCalledWith({
      url: '/applications/app1',
      query: {},
      tag: 'applications.get',
    })
  })

  it('fetches an application by slug within an organization, cached apart from other organizations', async () => {
    request.mockImplementation(({url}) => of({id: url}))

    const [inOrg1, inOrg2] = await Promise.all([
      application.resolveState(instance, 'studio', {organizationId: 'org1'}),
      application.resolveState(instance, 'studio', {organizationId: 'org2'}),
    ])

    expect(inOrg1).toEqual({id: '/organizations/org1/applications/studio'})
    expect(inOrg2).toEqual({id: '/organizations/org2/applications/studio'})
    expect(request).toHaveBeenCalledWith({
      url: '/organizations/org1/applications/studio',
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
    expect(source.getCurrent().data).toEqual([{nextCursor: null, data: [{id: 'app-2'}]}])
    unsubscribe()
  })

  it('updates an application via PATCH and refetches the invalidated list', async () => {
    request.mockImplementation((opts) => {
      const {method} = opts as {method?: string}
      return method === 'PATCH'
        ? of({id: 'app1', title: 'New'})
        : of({nextCursor: null, data: [{id: 'app1'}]})
    })

    const source = applications.getState(instance, {organizationId: 'org1'})
    const unsubscribe = source.subscribe()
    await vi.waitFor(() => expect(source.getCurrent().status).toBe('success'))

    const {data, invalidated} = await updateApplication(instance, {
      applicationId: 'app1',
      title: 'New',
    })
    await invalidated

    expect(data).toEqual({id: 'app1', title: 'New'})
    expect(request).toHaveBeenCalledWith({
      url: '/applications/app1',
      method: 'PATCH',
      body: {title: 'New'},
      tag: 'applications.update',
    })
    // initial list GET + PATCH + list refetch after invalidation
    expect(request).toHaveBeenCalledTimes(3)
    unsubscribe()
  })

  it('deletes an application via DELETE with no body', async () => {
    request.mockReturnValue(of({deleted: true}))

    const {data} = await deleteApplication(instance, {applicationId: 'app1'})

    expect(data).toEqual({deleted: true})
    expect(request).toHaveBeenCalledWith({
      url: '/applications/app1',
      method: 'DELETE',
      tag: 'applications.delete',
    })
  })

  it('sends a delete made right after an update once the update is answered, so the application stays deleted', async () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const update = new Subject<unknown>()
    request.mockReturnValueOnce(update).mockReturnValueOnce(of({deleted: true}))

    const updating = updateApplication(instance, {applicationId: 'app1', title: 'Renamed'})
    const deleting = deleteApplication(instance, {applicationId: 'app1'})
    // A delete that's only delayed, not queued, would have gone by now
    await vi.runAllTimersAsync()
    expect(request).toHaveBeenCalledOnce()

    update.next({id: 'app1'})
    await Promise.all([updating, deleting])
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({method: 'DELETE'}))
  })
})
