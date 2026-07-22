import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {checkPermissions} from './checkPermissions'

vi.mock('../client/clientStore')

describe('checkPermissions', () => {
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

  it('checks permissions on the global client and unwraps the data envelope', async () => {
    request.mockReturnValue(of({data: {'sanity.project.read': true}}))

    const result = await checkPermissions.resolveState(instance, 'project', 'p1', [
      'sanity.project.read',
    ])

    expect(result).toEqual({'sanity.project.read': true})
    expect(getClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'v2025-07-11',
      scope: 'global',
    })
    expect(request).toHaveBeenCalledWith({
      uri: '/access/project/p1/user-permissions/me/check',
      query: {permissions: ['sanity.project.read']},
      tag: 'access.check',
    })
  })

  it('does not create distinct cache entries for different permission orderings', async () => {
    request.mockReturnValue(of({data: {a: true, b: false}}))

    await checkPermissions.resolveState(instance, 'organization', 'org1', ['b', 'a'])
    await checkPermissions.resolveState(instance, 'organization', 'org1', ['a', 'b'])

    expect(request).toHaveBeenCalledTimes(1)
  })
})
