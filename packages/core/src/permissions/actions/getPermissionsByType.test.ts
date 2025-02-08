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

  it('returns new result when permissions change', () => {
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

    store.state.set('updatePermissions', {permissions: initialPermissions})
    const result1 = getPermissionsByType(instance, {type: 'sanity.project'})

    const subscription = store.state.observable.subscribe(() => {
      const updatedPermissions: Permission[] = [
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

      store.state.set('updatePermissions', {permissions: updatedPermissions})
      const result2 = getPermissionsByType(instance, {type: 'sanity.project'})

      expect(result1.getCurrent()).not.toBe(result2.getCurrent())
      expect(result2.getCurrent()).toHaveLength(2)

      subscription.unsubscribe()
    })
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
