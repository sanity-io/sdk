import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {type Permission, permissionsStore} from '../permissionsStore'
import {hasPermissionForResource} from './hasPermissionForResource'

describe('hasPermissionForResource', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('returns false with no permissions', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    store.state.set('updatePermissions', {permissions: []})

    const result = hasPermissionForResource(instance, {
      permissionName: 'sanity.project.read',
      resourceId: 'proj1',
    }).getCurrent()
    expect(result).toBe(false)
  })

  it('returns true when permission exists for resource', () => {
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

    const result = hasPermissionForResource(instance, {
      permissionName: 'sanity.project.read',
      resourceId: 'proj1',
    }).getCurrent()
    expect(result).toBe(true)
  })

  it('returns false when permission exists but for different resource', () => {
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

    const result = hasPermissionForResource(instance, {
      permissionName: 'sanity.project.read',
      resourceId: 'proj2',
    }).getCurrent()
    expect(result).toBe(false)
  })

  it('maintains memoization for same permission and resource check', () => {
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

    const result1 = hasPermissionForResource(instance, {
      permissionName: 'sanity.project.read',
      resourceId: 'proj1',
    }).getCurrent()
    const result2 = hasPermissionForResource(instance, {
      permissionName: 'sanity.project.read',
      resourceId: 'proj1',
    }).getCurrent()

    expect(result1).toBe(result2)
  })

  it('returns new result when permissions change', () => {
    const store = getOrCreateResource(instance, permissionsStore)

    const initialPermissions: Permission[] = []
    store.state.set('updatePermissions', {permissions: initialPermissions})
    const result1 = hasPermissionForResource(instance, {
      permissionName: 'sanity.project.read',
      resourceId: 'proj1',
    })

    const subscription = store.state.observable.subscribe(() => {
      const updatedPermissions: Permission[] = [
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

      store.state.set('updatePermissions', {permissions: updatedPermissions})
      const result2 = hasPermissionForResource(instance, {
        permissionName: 'sanity.project.read',
        resourceId: 'proj1',
      })

      expect(result1.getCurrent()).toBe(false)
      expect(result2.getCurrent()).toBe(true)

      subscription.unsubscribe()
    })
  })

  it('handles wildcard resource permissions', () => {
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
        resourceId: '*',
      },
    ]

    store.state.set('updatePermissions', {permissions: testPermissions})

    const result = hasPermissionForResource(instance, {
      permissionName: 'sanity.project.read',
      resourceId: 'proj1',
    }).getCurrent()
    expect(result).toBe(true)
  })
})
