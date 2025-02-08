import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {type Permission, permissionsStore} from '../permissionsStore'
import {getPermissionsForResource} from './getPermissionsForResource'

describe('getPermissionsForResource', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('returns empty array with no permissions', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    store.state.set('updatePermissions', {permissions: []})

    const result = getPermissionsForResource(instance, {resourceId: 'proj1'}).getCurrent()
    expect(result).toEqual([])
  })

  it('returns permissions for specific resource', () => {
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
        resourceId: 'proj2',
      },
    ]

    store.state.set('updatePermissions', {permissions: testPermissions})

    const result = getPermissionsForResource(instance, {resourceId: 'proj1'}).getCurrent()
    expect(result).toEqual([testPermissions[0]])
  })

  it('includes wildcard permissions', () => {
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
        name: 'sanity.project.admin',
        title: 'Project Admin',
        description: 'Admin access to all projects',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'project',
        resourceId: '*',
      },
    ]

    store.state.set('updatePermissions', {permissions: testPermissions})

    const result = getPermissionsForResource(instance, {resourceId: 'proj1'}).getCurrent()
    expect(result).toHaveLength(2)
    expect(result).toEqual(testPermissions)
  })

  it('maintains memoization for same resource and permissions', () => {
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

    const result1 = getPermissionsForResource(instance, {resourceId: 'proj1'}).getCurrent()
    const result2 = getPermissionsForResource(instance, {resourceId: 'proj1'}).getCurrent()

    expect(result1).toBe(result2)
  })

  it('returns new result when permissions change', () => {
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

    store.state.set('updatePermissions', {permissions: initialPermissions})
    const result1 = getPermissionsForResource(instance, {resourceId: 'proj1'})

    const subscription = store.state.observable.subscribe(() => {
      const updatedPermissions: Permission[] = [
        ...initialPermissions,
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
      ]

      store.state.set('updatePermissions', {permissions: updatedPermissions})
      const result2 = getPermissionsForResource(instance, {resourceId: 'proj1'})

      expect(result1.getCurrent()).not.toBe(result2.getCurrent())
      expect(result2.getCurrent()).toHaveLength(2)

      subscription.unsubscribe()
    })
  })
})
