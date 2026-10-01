import {firstValueFrom, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getDashboardOrganizationId} from '../auth/dashboardUtils'
import {installMessageBus, resetMessageBus} from '../dashboard/messageBus/bus'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {observeAppOrganizationId} from './appOrganization'

vi.mock('../auth/dashboardUtils', () => ({getDashboardOrganizationId: vi.fn()}))

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

const mockComlinkOrganization = (organizationId: string | undefined) =>
  vi.mocked(getDashboardOrganizationId).mockReturnValue({
    getCurrent: () => organizationId,
    subscribe: () => () => {},
    observable: of(organizationId),
  })

describe('observeAppOrganizationId', () => {
  let instance: SanityInstance

  afterEach(() => {
    vi.clearAllMocks()
    instance.dispose()
  })

  it('takes the organization the Dashboard opened the app in', async () => {
    mockComlinkOrganization('org-dashboard')
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      organizationId: 'org-configured',
    })

    await expect(firstValueFrom(observeAppOrganizationId(instance))).resolves.toBe('org-dashboard')
  })

  it('falls back to the configured organization outside the Dashboard', async () => {
    mockComlinkOrganization(undefined)
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      organizationId: 'org-configured',
    })

    await expect(firstValueFrom(observeAppOrganizationId(instance))).resolves.toBe('org-configured')
  })

  it('has no organization when neither source has one', async () => {
    mockComlinkOrganization(undefined)
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    await expect(firstValueFrom(observeAppOrganizationId(instance))).resolves.toBeUndefined()
  })
})

describe('observeAppOrganizationId (message bus)', () => {
  let instance: SanityInstance
  let host: ReturnType<typeof installMessageBus>

  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      organizationId: 'org-configured',
    })
  })

  afterEach(() => {
    instance.dispose()
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('takes the organization the host publishes', async () => {
    const organizationId = firstValueFrom(observeAppOrganizationId(instance))

    host.connections.subscribe((client) =>
      client.emit('organizations.current', {id: 'org-bus', name: 'Org', slug: 'org'}),
    )

    await expect(organizationId).resolves.toBe('org-bus')
  })

  it('waits for the host rather than resolving against the config first', async () => {
    // Emitting the configured organization and then changing to the host's
    // would point a comment read at one organization and then another.
    let emitted: string | undefined | 'none' = 'none'
    const subscription = observeAppOrganizationId(instance).subscribe((value) => {
      emitted = value
    })

    expect(emitted).toBe('none')

    subscription.unsubscribe()
  })

  it('falls back to the config when the host has no active organization', async () => {
    const organizationId = firstValueFrom(observeAppOrganizationId(instance))

    host.connections.subscribe((client) => client.emit('organizations.current', null))

    await expect(organizationId).resolves.toBe('org-configured')
  })
})
