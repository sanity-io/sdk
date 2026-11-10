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

test("a preference is the default, the user's own value, or the shared one", async () => {
  const stored = await updateUserPreference(instance, {userId: 'u', key: KEY, value: 'raw'})
  if (stored.isDefault) expectTypeOf(stored.resourceType).toEqualTypeOf<undefined>()
  else expectTypeOf(stored.resourceType).toEqualTypeOf<'organization' | 'project' | undefined>()
})

test('a list key takes the items it can hold', () => {
  void updateUserPreference(instance, {
    userId: 'u',
    key: 'manage.favorites.projects',
    value: (list) => [...list, {ref: 'abc123'}],
  })
  void updateUserPreference(instance, {
    userId: 'u',
    key: 'manage.favorites.projects',
    // @ts-expect-error An item needs a `ref`
    value: [{}],
  })
})

test('a key stored on the user alone takes no resource', () => {
  void updateUserPreference(instance, {userId: 'u', key: 'manage.favorites.projects', value: []})
  void updateUserPreference(instance, {
    userId: 'u',
    key: 'manage.favorites.projects',
    value: [],
    // @ts-expect-error Stored on the user alone, in no project
    projectId: 'p',
  })
})

test('only a key with a shared value takes `shared`', () => {
  // @ts-expect-error The layout has no shared value
  void updateUserPreference(instance, {userId: 'u', key: KEY, value: 'raw', shared: true})
  void updateUserPreference(instance, {userId: 'u', key: KEY, value: 'raw', shared: false})
})

test('a shared preference always names its kind of resource', async () => {
  const stored = await updateUserPreference(instance, {userId: 'u', key: KEY, value: 'raw'})
  if (stored.shared) expectTypeOf(stored.resourceType).toEqualTypeOf<'organization' | 'project'>()
})
