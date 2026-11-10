import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {updateUserPreference} from './preferences'
import {type PreferenceValue} from './registry'

const instance = {} as SanityInstance
const KEY = 'studio.structure-tool.inspect-view-mode'

test('a key with a parameter takes any value for it, and types its value', () => {
  expectTypeOf<PreferenceValue<'studio.structure-tool.layout.my-pane'>>().toEqualTypeOf<string>()
})

test('a key only accepts the values it can hold, or undefined', () => {
  void updateUserPreference(instance, {userId: 'u', key: KEY, value: 'raw'})
  void updateUserPreference(instance, {userId: 'u', key: KEY, value: undefined})
  // @ts-expect-error Not a view mode
  void updateUserPreference(instance, {userId: 'u', key: KEY, value: 'pretty'})
})

test("a function gets the key's value, never undefined, and returns one or undefined", () => {
  void updateUserPreference(instance, {
    userId: 'u',
    key: KEY,
    value: (current) => {
      expectTypeOf(current).toEqualTypeOf<'parsed' | 'raw'>()
      return current === 'raw' ? undefined : 'raw'
    },
  })
  // @ts-expect-error Not a view mode
  void updateUserPreference(instance, {userId: 'u', key: KEY, value: () => 'pretty'})
})

test('the stored preference is typed by its key', async () => {
  const stored = await updateUserPreference(instance, {userId: 'u', key: KEY, value: 'raw'})
  expectTypeOf(stored.value).toEqualTypeOf<'parsed' | 'raw'>()
})

test('an undeclared key fails to type-check', () => {
  // @ts-expect-error Not a preference key
  void updateUserPreference(instance, {userId: 'u', key: 'studio.unknown', value: 'x'})
})

test('a key only takes the IDs of the resource it is stored in', () => {
  void updateUserPreference(instance, {userId: 'u', key: KEY, value: 'raw', projectId: 'p'})
  void updateUserPreference(instance, {
    userId: 'u',
    key: KEY,
    value: 'raw',
    resourceType: 'project',
    projectId: 'p',
  })
  // @ts-expect-error Stored per project, not per organization
  void updateUserPreference(instance, {userId: 'u', key: KEY, value: 'raw', organizationId: 'o'})
  void updateUserPreference(instance, {
    userId: 'u',
    key: KEY,
    value: 'raw',
    // @ts-expect-error Stored per project, not per organization
    resourceType: 'organization',
  })
})

test("a preference is either the default, or the user's own value in a resource", async () => {
  const stored = await updateUserPreference(instance, {userId: 'u', key: KEY, value: 'raw'})
  if (stored.isDefault) expectTypeOf(stored.resourceType).toEqualTypeOf<undefined>()
  else expectTypeOf(stored.resourceType).toEqualTypeOf<'organization' | 'project'>()
})
