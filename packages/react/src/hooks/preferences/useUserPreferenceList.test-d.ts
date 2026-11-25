import {expectTypeOf, test} from 'vitest'

import {useUpdateUserPreferenceList} from './useUpdateUserPreferenceList'
import {useUserPreferenceList} from './useUserPreferenceList'

test("types each item's value by its key", () => {
  expectTypeOf(
    useUserPreferenceList('studio.vision-tool.saved-queries').data[0]!.value.url,
  ).toEqualTypeOf<string>()
})

test('a key without separate items fails to type-check', () => {
  // @ts-expect-error Not an items key
  useUserPreferenceList('studio.structure-tool.inspect-view-mode')
})

test('a key only takes the IDs of the resource it is stored in', () => {
  useUserPreferenceList('studio.vision-tool.saved-queries', {projectId: 'p'})
  // @ts-expect-error Saved queries are stored per project, not per organization
  useUserPreferenceList('studio.vision-tool.saved-queries', {organizationId: 'o'})
})

test('accepts refetchInterval as a number or false on reads, not on writes', () => {
  useUserPreferenceList('studio.vision-tool.saved-queries', {refetchInterval: false})
  useUserPreferenceList('studio.vision-tool.saved-queries', {
    projectId: 'p',
    refetchInterval: 30_000,
  })
  // @ts-expect-error refetchInterval accepts a number or false, not true
  useUserPreferenceList('studio.vision-tool.saved-queries', {refetchInterval: true})
  // @ts-expect-error Mutations do not poll
  useUpdateUserPreferenceList('studio.vision-tool.saved-queries', {refetchInterval: false})
})
