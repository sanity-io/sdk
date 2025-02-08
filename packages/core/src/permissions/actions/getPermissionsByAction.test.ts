import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {type Permission, permissionsStore} from '../permissionsStore'
import {getPermissionsByAction} from './getPermissionsByAction'

describe('getPermissionsByAction', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('returns empty array with no permissions', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    store.state.set('updatePermissions', {permissions: []})

    const result = getPermissionsByAction(instance, {action: 'read'}).getCurrent()
    expect(result).toEqual([])
  })

  it('filters permissions by action', () => {
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
    ]

    store.state.set('updatePermissions', {permissions: testPermissions})

    const readResult = getPermissionsByAction(instance, {action: 'read'}).getCurrent()
    expect(readResult).toEqual([testPermissions[0]])

    const writeResult = getPermissionsByAction(instance, {action: 'write'}).getCurrent()
    expect(writeResult).toEqual([testPermissions[1]])
  })

  it('maintains memoization for same action and permissions', () => {
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

    const result1 = getPermissionsByAction(instance, {action: 'read'}).getCurrent()
    const result2 = getPermissionsByAction(instance, {action: 'read'}).getCurrent()

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
    const result1 = getPermissionsByAction(instance, {action: 'read'})

    const subscription = store.state.observable.subscribe(() => {
      const updatedPermissions: Permission[] = [
        ...initialPermissions,
        {
          type: 'grant',
          name: 'sanity.project.read',
          title: 'Read Project 2',
          description: 'Read project data 2',
          config: {},
          ownerOrganizationId: 'org1',
          resourceType: 'project',
          resourceId: 'proj2',
        },
      ]

      store.state.set('updatePermissions', {permissions: updatedPermissions})
      const result2 = getPermissionsByAction(instance, {action: 'read'})

      expect(result1.getCurrent()).not.toBe(result2.getCurrent())
      expect(result2.getCurrent()).toHaveLength(2)

      subscription.unsubscribe()
    })
  })
})
