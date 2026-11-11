import {expectTypeOf, test} from 'vitest'

import {useUserPreference} from './useUserPreference'

test('types the value by its key', () => {
  expectTypeOf(
    useUserPreference('studio.structure-tool.inspect-view-mode').data.value,
  ).toEqualTypeOf<'parsed' | 'raw'>()
  expectTypeOf(
    useUserPreference('studio.structure-tool.layout.my-pane').data.value,
  ).toEqualTypeOf<string>()
})

test('an undeclared key fails to type-check', () => {
  // @ts-expect-error Not a preference key
  useUserPreference('studio.unknown')
})

test('a key only takes the IDs of the resource it is stored in', () => {
  useUserPreference('studio.structure-tool.inspect-view-mode', {projectId: 'p'})
  // @ts-expect-error Stored per project, not per organization
  useUserPreference('studio.structure-tool.inspect-view-mode', {organizationId: 'o'})
})
