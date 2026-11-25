import {expectTypeOf, test} from 'vitest'

import {useUpdateUserPreference} from './useUpdateUserPreference'
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

test('only a key with a shared value takes `shared`', () => {
  // @ts-expect-error The layout has no shared value
  useUserPreference('studio.structure-tool.inspect-view-mode', {shared: true})
  // @ts-expect-error Starred projects are the user's own, in no resource
  useUserPreference('manage.pinned.projects', {resourceType: 'project'})
})

test('accepts refetchInterval as a number or false on reads, not on writes', () => {
  useUserPreference('studio.structure-tool.inspect-view-mode', {refetchInterval: false})
  useUserPreference('studio.structure-tool.inspect-view-mode', {
    projectId: 'p',
    refetchInterval: 10_000,
  })
  useUserPreference('manage.pinned.projects', {refetchInterval: false})
  useUserPreference('manage.pinned.projects', {refetchInterval: 120_000})
  // @ts-expect-error refetchInterval accepts a number or false, not true
  useUserPreference('studio.structure-tool.inspect-view-mode', {refetchInterval: true})
  // @ts-expect-error Mutations do not poll
  useUpdateUserPreference('studio.structure-tool.inspect-view-mode', {refetchInterval: false})
})
