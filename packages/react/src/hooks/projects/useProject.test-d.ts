import {type Project, type ProjectMember} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {useProject} from './useProject'

test('useProject — no args: members and features both included by default', () => {
  expectTypeOf(useProject()).toEqualTypeOf<Project<true, true>>()
  type Result = ReturnType<typeof useProject<true, true>>
  expectTypeOf<Result['members']>().toEqualTypeOf<ProjectMember[]>()
})

test('useProject — includeMembers: false drops members from the type', () => {
  expectTypeOf(useProject({includeMembers: false})).toEqualTypeOf<Project<false, true>>()
})

test('useProject — includeFeatures: false drops features from the type', () => {
  expectTypeOf(useProject({includeFeatures: false})).toEqualTypeOf<Project<true, false>>()
})

test('useProject — both flags true → both arrays present', () => {
  expectTypeOf(useProject({includeMembers: true, includeFeatures: true})).toEqualTypeOf<
    Project<true, true>
  >()
})

test('useProject — both flags false → bare base shape', () => {
  expectTypeOf(useProject({includeMembers: false, includeFeatures: false})).toEqualTypeOf<
    Project<false, false>
  >()
  type Result = ReturnType<typeof useProject<false, false>>
  expectTypeOf<Result['id']>().toEqualTypeOf<string>()
})

test('useProject — rejects non-boolean flag values', () => {
  // @ts-expect-error — includeMembers must be a boolean
  void useProject({includeMembers: 'yes'})
})

test('useProject — projectId alone does not change the data shape', () => {
  expectTypeOf(useProject({projectId: 'p'})).toEqualTypeOf<Project<true, true>>()
})

test('useProject — non-literal boolean flag makes members optional', () => {
  const includeMembers = false as boolean
  expectTypeOf(useProject({includeMembers})).toEqualTypeOf<Project<boolean, true>>()
  type Result = ReturnType<typeof useProject<boolean, true>>
  expectTypeOf<Result['members']>().toEqualTypeOf<ProjectMember[] | undefined>()
  expectTypeOf<Pick<Result, 'members'>>().toEqualTypeOf<{members?: ProjectMember[]}>()
})
