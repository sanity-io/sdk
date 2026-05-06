import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {
  getProjectState,
  type Project,
  type ProjectBase,
  type ProjectMember,
  resolveProject,
} from './project'

const instance = {} as SanityInstance

test('resolveProject — default call: members and features both included by default', () => {
  expectTypeOf(resolveProject(instance)).resolves.toEqualTypeOf<Project<true, true>>()
  type Result = Awaited<ReturnType<typeof resolveProject<true, true>>>
  expectTypeOf<Result['members']>().toEqualTypeOf<ProjectMember[]>()
})

test('resolveProject — includeMembers: false drops members from the type', () => {
  expectTypeOf(resolveProject(instance, {includeMembers: false})).resolves.toEqualTypeOf<
    Project<false, true>
  >()
})

test('resolveProject — includeFeatures: false drops features from the type', () => {
  expectTypeOf(resolveProject(instance, {includeFeatures: false})).resolves.toEqualTypeOf<
    Project<true, false>
  >()
})

test('resolveProject — both flags false → bare base shape', () => {
  expectTypeOf(
    resolveProject(instance, {includeMembers: false, includeFeatures: false}),
  ).resolves.toEqualTypeOf<Project<false, false>>()
  type Result = Awaited<ReturnType<typeof resolveProject<false, false>>>
  expectTypeOf<Result['id']>().toEqualTypeOf<string>()
})

test('resolveProject — rejects non-boolean flag values', () => {
  // @ts-expect-error — includeMembers must be a boolean
  void resolveProject(instance, {includeMembers: 'yes'})
})

test('resolveProject — projectId alone does not change the data shape', () => {
  expectTypeOf(resolveProject(instance, {projectId: 'p'})).resolves.toEqualTypeOf<
    Project<true, true>
  >()
})

test('resolveProject — non-literal boolean flag makes members optional', () => {
  const includeMembers = false as boolean
  expectTypeOf(resolveProject(instance, {includeMembers})).resolves.toEqualTypeOf<
    Project<boolean, true>
  >()
})

test('getProjectState — default call returns members + features StateSource', () => {
  expectTypeOf(getProjectState(instance)).toEqualTypeOf<
    StateSource<Project<true, true> | undefined>
  >()
})

test('getProjectState — both flags false narrows to the bare base shape', () => {
  expectTypeOf(
    getProjectState(instance, {includeMembers: false, includeFeatures: false}),
  ).toEqualTypeOf<StateSource<Project<false, false> | undefined>>()
})

test('Project — wide boolean for IncludeMembers makes members optional', () => {
  expectTypeOf<Project<boolean, true>>().toEqualTypeOf<
    ProjectBase & {members?: ProjectMember[]} & {features: string[]}
  >()
  expectTypeOf<Pick<Project<boolean, true>, 'members'>>().toEqualTypeOf<{
    members?: ProjectMember[]
  }>()
})

test('Project — wide boolean for IncludeFeatures makes features optional', () => {
  expectTypeOf<Project<true, boolean>>().toEqualTypeOf<
    ProjectBase & {members: ProjectMember[]} & {features?: string[]}
  >()
  expectTypeOf<Pick<Project<true, boolean>, 'features'>>().toEqualTypeOf<{
    features?: string[]
  }>()
})

test('Project — both wide booleans make both fields optional', () => {
  expectTypeOf<Project<boolean, boolean>>().toEqualTypeOf<
    ProjectBase & {members?: ProjectMember[]} & {features?: string[]}
  >()
})
