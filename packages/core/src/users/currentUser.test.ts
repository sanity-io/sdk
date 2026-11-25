import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {uninstallTestMessageBus} from '../dashboard/messageBus/__fixtures__/uninstallTestMessageBus'
import {installMessageBus} from '../dashboard/messageBus/bus'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {currentUser} from './currentUser'

vi.mock('../client/clientStore')

const user = {
  id: 'gX7a2bQ9c',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'administrator',
  roles: [],
  attributes: [{key: 'team', type: 'string', value: 'marketing'}],
}

describe('currentUser', () => {
  let instance: SanityInstance
  const request = vi.fn()

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd', organizationId: 'oConfigured'})
    request.mockReset().mockReturnValue(of(user))
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => instance.dispose())

  it('returns the user with attributes for the configured organization', async () => {
    const result = await currentUser.resolveState(instance, {includeUserAttributes: true})

    expect(result).toStrictEqual(user)
    expect(getClientState).toHaveBeenCalledWith(instance, {apiVersion: 'v2026-11-24'})
    expect(request).toHaveBeenCalledWith({
      url: '/users/me',
      query: {includeUserAttributes: 'true', organizationId: 'oConfigured'},
      tag: 'users.get-current',
    })
  })

  it('prefers an explicit organizationId over the configured one', async () => {
    await currentUser.resolveState(instance, {
      includeUserAttributes: true,
      organizationId: 'oOther',
    })

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({query: {includeUserAttributes: 'true', organizationId: 'oOther'}}),
    )
  })

  it('reads attributes for the current organization on the message bus', async () => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    const host = installMessageBus({appId: 'dashboard'})
    onTestFinished(() => {
      uninstallTestMessageBus()
      vi.unstubAllGlobals()
    })
    host.connections.subscribe((client) =>
      client.emit('organizations.current', {id: 'oSyH1iET5', name: 'Fernway', slug: 'fernway'}),
    )

    await currentUser.resolveState(instance, {includeUserAttributes: true})

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {includeUserAttributes: 'true', organizationId: 'oSyH1iET5'},
      }),
    )
  })
})
