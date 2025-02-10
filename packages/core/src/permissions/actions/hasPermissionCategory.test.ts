import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {type Permission, permissionsStore} from '../permissionsStore'
import {hasPermissionCategory} from './hasPermissionCategory'

describe('hasPermissionCategory', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('returns false with no permissions', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    store.state.set('updatePermissions', {permissions: []})

    const result = hasPermissionCategory(instance, {category: 'sanity.project'}).getCurrent()
    expect(result).toBe(false)
  })

  it('returns true when permission in category exists', () => {
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

    const result = hasPermissionCategory(instance, {category: 'sanity.project'}).getCurrent()
    expect(result).toBe(true)
  })

  it('returns false when no permissions in category exist', () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const testPermissions: Permission[] = [
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

    const result = hasPermissionCategory(instance, {category: 'sanity.project'}).getCurrent()
    expect(result).toBe(false)
  })

  it('maintains memoization for same category check', () => {
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

    const result1 = hasPermissionCategory(instance, {category: 'sanity.project'}).getCurrent()
    const result2 = hasPermissionCategory(instance, {category: 'sanity.project'}).getCurrent()

    expect(result1).toBe(result2)
  })

  it('returns new result when permissions change', async () => {
    const store = getOrCreateResource(instance, permissionsStore)
    const initialPermissions: Permission[] = []

    // Set initial permissions and verify
    store.state.set('updatePermissions', {permissions: initialPermissions})
    const initialResult = hasPermissionCategory(instance, {category: 'sanity.project'}).getCurrent()
    expect(initialResult).toBe(false)

    // Create a promise that resolves when the state updates
    const stateUpdatePromise = new Promise<void>((resolve) => {
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

      const subscription = store.state.observable.subscribe((state) => {
        if (state.permissions?.length === 1) {
          const newValue = hasPermissionCategory(instance, {
            category: 'sanity.project',
          }).getCurrent()
          expect(newValue).toBe(true)
          subscription.unsubscribe()
          resolve()
        }
      })

      // Update permissions after subscription is set up
      store.state.set('updatePermissions', {permissions: updatedPermissions})
    })

    await stateUpdatePromise
  })

  it('matches permissions using startsWith', () => {
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
        name: 'sanity.project.special.read',
        title: 'Read Special Project',
        description: 'Read special project data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'project',
        resourceId: 'proj1',
      },
    ]

    store.state.set('updatePermissions', {permissions: testPermissions})

    const result = hasPermissionCategory(instance, {category: 'sanity.project'}).getCurrent()
    expect(result).toBe(true)
  })
})
