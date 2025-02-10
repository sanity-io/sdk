import {beforeEach, describe, expect, it} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {type Permission, permissionsStore} from '../permissionsStore'
import {getPermissions} from './getPermissions'

describe('getPermissions', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance(config)
  })

  it('returns empty permissions by default', () => {
    const result = getPermissions(instance)
    expect(result.getCurrent()).toEqual({})
  })

  it('groups permissions by resource type and id', () => {
    // Set up test permissions in the store
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
        description: 'Read organization data',
        config: {},
        ownerOrganizationId: 'org1',
        resourceType: 'organization',
        resourceId: 'org1',
      },
    ]

    // Update the store state
    const store = getOrCreateResource(instance, permissionsStore)
    store.state.set('updatePermissions', {permissions: testPermissions})

    const result = getPermissions(instance)

    expect(result.getCurrent()).toEqual({
      project: {
        proj1: ['sanity.project.read', 'sanity.project.write'],
      },
      organization: {
        org1: ['sanity.organization.read'],
      },
    })
  })

  it('maintains memoization for same permissions', () => {
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

    const store = getOrCreateResource(instance, permissionsStore)
    store.state.set('updatePermissions', {permissions: testPermissions})

    const result1 = getPermissions(instance).getCurrent()
    const result2 = getPermissions(instance).getCurrent()

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
    const initialResult = getPermissions(instance).getCurrent()
    expect(initialResult).toEqual({
      project: {
        proj1: ['sanity.project.read'],
      },
    })

    // Create a promise that resolves when the state updates
    const stateUpdatePromise = new Promise<void>((resolve) => {
      const updatedPermissions = [
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

      const subscription = store.state.observable.subscribe((state) => {
        if (state.permissions?.length === 2) {
          const newValue = getPermissions(instance).getCurrent()
          expect(newValue).toEqual({
            project: {
              proj1: ['sanity.project.read', 'sanity.project.write'],
            },
          })
          subscription.unsubscribe()
          resolve()
        }
      })

      // Update permissions after subscription is set up
      store.state.set('updatePermissions', {permissions: updatedPermissions})
    })

    await stateUpdatePromise
  })
})
