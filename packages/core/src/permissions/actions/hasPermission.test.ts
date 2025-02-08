import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {type Permission, permissionsStore} from '../permissionsStore'
import {hasPermission} from './hasPermission'

describe('hasPermission', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('returns false with no permissions', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    store.state.set('updatePermissions', {permissions: []})

    const result = hasPermission(instance, {permissionName: 'sanity.project.read'}).getCurrent()
    expect(result).toBe(false)
  })

  it('returns true when permission exists', () => {
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

    const result = hasPermission(instance, {permissionName: 'sanity.project.read'}).getCurrent()
    expect(result).toBe(true)
  })

  it('returns false when permission does not exist', () => {
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

    const result = hasPermission(instance, {permissionName: 'sanity.project.write'}).getCurrent()
    expect(result).toBe(false)
  })

  it('maintains memoization for same permission check', () => {
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

    const result1 = hasPermission(instance, {permissionName: 'sanity.project.read'}).getCurrent()
    const result2 = hasPermission(instance, {permissionName: 'sanity.project.read'}).getCurrent()

    expect(result1).toBe(result2)
  })

  it('returns new result when permissions change', () => {
    const store = getOrCreateResource(instance, permissionsStore)

    const initialPermissions: Permission[] = []
    store.state.set('updatePermissions', {permissions: initialPermissions})
    const result1 = hasPermission(instance, {permissionName: 'sanity.project.read'})

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
      const result2 = hasPermission(instance, {permissionName: 'sanity.project.read'})

      expect(result1.getCurrent()).toBe(false)
      expect(result2.getCurrent()).toBe(true)

      subscription.unsubscribe()
    })
  })

  it('handles case-sensitive permission names', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const testPermissions: Permission[] = [
      {
        type: 'grant',
        name: 'sanity.project.READ',
        title: 'Read Project',
        description: 'Read project data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'project',
        resourceId: 'proj1',
      },
    ]

    store.state.set('updatePermissions', {permissions: testPermissions})

    const result = hasPermission(instance, {permissionName: 'sanity.project.read'}).getCurrent()
    expect(result).toBe(false)
  })
})
