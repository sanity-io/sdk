import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {defineMutation} from '../store/fetcherStore'
import {installation, installations} from './installations'

vi.mock('../client/clientStore')

describe('installations', () => {
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

  it('lists installations for an organization on the global client', async () => {
    const response = {nextCursor: null, data: [{id: 'inst1'}]}
    request.mockReturnValue(of(response))

    const result = await installations.resolveState(instance, {
      organizationId: 'org1',
      include: ['interfaces', 'config.mfManifest'],
    })

    expect(result).toEqual([response])
    expect(getClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      scope: 'global',
    })
    expect(request).toHaveBeenCalledWith({
      url: '/installations',
      query: {organizationId: 'org1', include: 'config.mfManifest,interfaces'},
      tag: 'installations.list',
    })
  })

  it('reads the next page with the cursor the one before returned, keeping the filters', async () => {
    request
      .mockReturnValueOnce(of({nextCursor: 'c1', data: [{id: 'inst1'}]}))
      .mockReturnValueOnce(of({nextCursor: null, data: [{id: 'inst2'}]}))
    const options = {organizationId: 'org1', include: ['access' as const], limit: 1}
    await installations.resolveState(instance, options)

    const pages = await installations.loadMore(instance, options)

    expect(pages.flatMap(({data}) => data)).toEqual([{id: 'inst1'}, {id: 'inst2'}])
    expect(request).toHaveBeenLastCalledWith({
      url: '/installations',
      query: {organizationId: 'org1', include: 'access', limit: '1', cursor: 'c1'},
      tag: 'installations.list',
    })
  })

  it('starts from the cursor the app passes, then loads more from the page it read', async () => {
    request
      .mockReturnValueOnce(of({nextCursor: 'c2', data: [{id: 'inst2'}]}))
      .mockReturnValueOnce(of({nextCursor: null, data: [{id: 'inst3'}]}))
    const options = {organizationId: 'org1', cursor: 'c1'}
    await installations.resolveState(instance, options)

    await installations.loadMore(instance, options)

    expect(request.mock.calls.map(([{query}]) => query.cursor)).toEqual(['c1', 'c2'])
  })

  it('refetches the list when a mutation invalidates an installation on a page loaded after the first', async () => {
    request.mockImplementation(({query}) =>
      of(
        query.cursor
          ? {nextCursor: null, data: [{id: 'inst2'}]}
          : {nextCursor: 'c1', data: [{id: 'inst1'}]},
      ),
    )
    const source = installations.getState(instance, {organizationId: 'org1'})
    onTestFinished(source.subscribe())
    await vi.waitFor(() => expect(source.getCurrent().status).toBe('success'))
    await installations.loadMore(instance, {organizationId: 'org1'})
    request.mockClear()

    const change = defineMutation<undefined, {ok: boolean}>({
      name: 'test-change-installation',
      mutationFn: () => () => of({ok: true}),
      invalidates: [{type: 'installation', id: 'inst2'}],
    })
    const {invalidated} = await change(instance, undefined)
    await invalidated

    expect(request).toHaveBeenCalledTimes(2)
  })

  it('fetches a single installation by id', async () => {
    const inst = {id: 'inst1', applicationId: 'app1'}
    request.mockReturnValue(of(inst))

    const result = await installation.resolveState(instance, 'inst1', {
      include: ['config.mfManifest'],
    })

    expect(result).toEqual(inst)
    expect(request).toHaveBeenCalledWith({
      url: '/installations/inst1',
      query: {include: 'config.mfManifest'},
      tag: 'installations.get',
    })
  })
})
