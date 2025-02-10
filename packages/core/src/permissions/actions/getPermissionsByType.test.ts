import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {type Permission, permissionsStore} from '../permissionsStore'
import {getPermissionsByType} from './getPermissionsByType'

describe('getPermissionsByType', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('returns empty array with no permissions', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    store.state.set('updatePermissions', {permissions: []})

    const result = getPermissionsByType(instance, {type: 'sanity.project'}).getCurrent()
    expect(result).toEqual([])
  })

  it('filters permissions by type prefix', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const testPermissions: Permission[] = [
      {
        type: 'sanity.project',
        name: 'sanity.project.read',
        title: 'Read Project',
        description: 'Read project data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'project',
        resourceId: 'proj1',
      },
      {
        type: 'sanity.organization',
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

    const projectResult = getPermissionsByType(instance, {type: 'sanity.project'}).getCurrent()
    expect(projectResult).toEqual([testPermissions[0]])

    const orgResult = getPermissionsByType(instance, {type: 'sanity.organization'}).getCurrent()
    expect(orgResult).toEqual([testPermissions[1]])
  })

  it('maintains memoization for same type and permissions', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const testPermissions: Permission[] = [
      {
        type: 'sanity.project',
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

    const result1 = getPermissionsByType(instance, {type: 'sanity.project'}).getCurrent()
    const result2 = getPermissionsByType(instance, {type: 'sanity.project'}).getCurrent()

    expect(result1).toBe(result2)
  })

  it('returns new result when permissions change', async () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const initialPermissions: Permission[] = [
      {
        type: 'sanity.project',
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
    const initialResult = getPermissionsByType(instance, {type: 'sanity.project'}).getCurrent()
    expect(initialResult).toEqual([initialPermissions[0]])

    // Create a promise that resolves when the state updates
    const stateUpdatePromise = new Promise<void>((resolve) => {
      const updatedPermissions = [
        ...initialPermissions,
        {
          type: 'sanity.project',
          name: 'sanity.project.write',
          title: 'Write Project',
          description: 'Write project data',
          config: {},
          ownerOrganizationId: 'org1',
          resourceType: 'project',
          resourceId: 'proj1',
        },
      ]

      const subscription = store.state.observable.subscribe((state) => {
        if (state.permissions?.length === 2) {
          const newValue = getPermissionsByType(instance, {type: 'sanity.project'}).getCurrent()
          expect(newValue).not.toEqual(initialResult)
          expect(newValue).toHaveLength(2)
          subscription.unsubscribe()
          resolve()
        }
      })

      // Update permissions after subscription is set up
      store.state.set('updatePermissions', {permissions: updatedPermissions})
    })

    await stateUpdatePromise
  })

  it('handles partial type matches', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const testPermissions: Permission[] = [
      {
        type: 'sanity.project.special',
        name: 'sanity.project.special.read',
        title: 'Read Special Project',
        description: 'Read special project data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'project',
        resourceId: 'proj1',
      },
      {
        type: 'sanity.project',
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

    const result = getPermissionsByType(instance, {type: 'sanity.project'}).getCurrent()
    expect(result).toEqual(testPermissions)
  })
})
