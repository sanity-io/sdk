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
    const result1 = getPermissionsResourceTypes(instance)

    const subscription = store.state.observable.subscribe(() => {
      const updatedPermissions: Permission[] = [
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

      store.state.set('updatePermissions', {permissions: updatedPermissions})
      const result2 = getPermissionsResourceTypes(instance)

      expect(result1.getCurrent()).not.toBe(result2.getCurrent())
      expect(result2.getCurrent()).toEqual(new Set(['project', 'organization']))

      subscription.unsubscribe()
    })
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
