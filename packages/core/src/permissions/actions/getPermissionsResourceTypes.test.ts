import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {type Permission, permissionsStore} from '../permissionsStore'
import {getPermissionsResourceTypes} from './getPermissionsResourceTypes'

describe('getPermissionsResourceTypes', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('returns empty set with no permissions', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    store.state.set('updatePermissions', {permissions: []})

    const result = getPermissionsResourceTypes(instance).getCurrent()
    expect(result).toEqual(new Set())
  })

  it('returns unique resource types', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const testPermissions: Permission[] = [
      {
        type: 'grant',
        name: 'sanity.project.read',
        title: 'Read Project',
        description: 'Read project data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'project',
        resourceId: 'proj1',
      },
      {
        type: 'grant',
        name: 'sanity.project.write',
        title: 'Write Project',
        description: 'Write project data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'project',
        resourceId: 'proj1',
      },
      {
        type: 'grant',
        name: 'sanity.organization.read',
        title: 'Read Organization',
        description: 'Read org data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'organization',
        resourceId: 'org1',
      },
    ]

    store.state.set('updatePermissions', {permissions: testPermissions})

    const result = getPermissionsResourceTypes(instance).getCurrent()
    expect(result).toEqual(new Set(['project', 'organization']))
  })

  it('maintains memoization for same permissions', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const testPermissions: Permission[] = [
      {
        type: 'grant',
        name: 'sanity.project.read',
        title: 'Read Project',
        description: 'Read project data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'project',
        resourceId: 'proj1',
      },
    ]

    store.state.set('updatePermissions', {permissions: testPermissions})

    const result1 = getPermissionsResourceTypes(instance).getCurrent()
    const result2 = getPermissionsResourceTypes(instance).getCurrent()

    expect(result1).toBe(result2)
  })

  it('returns new result when permissions change', async () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const initialPermissions: Permission[] = [
      {
        type: 'grant',
        name: 'sanity.project.read',
        title: 'Read Project',
        description: 'Read project data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'project',
        resourceId: 'proj1',
      },
    ]

    // Set initial permissions and verify
    store.state.set('updatePermissions', {permissions: initialPermissions})
    const initialResult = getPermissionsResourceTypes(instance).getCurrent()
    expect(initialResult).toEqual(new Set(['project']))

    // Create a promise that resolves when the state updates
    const stateUpdatePromise = new Promise<void>((resolve) => {
      const updatedPermissions = [
        ...initialPermissions,
        {
          type: 'grant',
          name: 'sanity.organization.read',
          title: 'Read Organization',
          description: 'Read org data',
          config: {},
          ownerOrganizationId: 'org1',
          resourceType: 'organization',
          resourceId: 'org1',
        },
      ]

      const subscription = store.state.observable.subscribe((state) => {
        if (state.permissions?.length === 2) {
          const newValue = getPermissionsResourceTypes(instance).getCurrent()
          expect(newValue).not.toEqual(initialResult)
          expect(newValue).toEqual(new Set(['project', 'organization']))
          subscription.unsubscribe()
          resolve()
        }
      })

      // Update permissions after subscription is set up
      store.state.set('updatePermissions', {permissions: updatedPermissions})
    })

    await stateUpdatePromise
  })

  it('handles empty resource types', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const testPermissions: Permission[] = [
      {
        type: 'grant',
        name: 'sanity.project.read',
        title: 'Read Project',
        description: 'Read project data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: '',
        resourceId: 'proj1',
      },
    ]

    store.state.set('updatePermissions', {permissions: testPermissions})

    const result = getPermissionsResourceTypes(instance).getCurrent()
    expect(result).toEqual(new Set(['']))
  })
})
