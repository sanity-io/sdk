import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
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
      include: ['interfaces'],
    })

    expect(result).toEqual(response)
    expect(getClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      scope: 'global',
    })
    expect(request).toHaveBeenCalledWith({
      uri: '/installations',
      query: {organizationId: 'org1', include: 'interfaces'},
      tag: 'installations.list',
    })
  })

  it('fetches a single installation by id', async () => {
    const inst = {id: 'inst1', applicationId: 'app1'}
    request.mockReturnValue(of(inst))

    const result = await installation.resolveState(instance, 'inst1')

    expect(result).toEqual(inst)
    expect(request).toHaveBeenCalledWith({
      uri: '/installations/inst1',
      query: {},
      tag: 'installations.get',
    })
  })
})
