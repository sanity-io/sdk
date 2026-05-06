import {expectTypeOf, test} from 'vitest'

import {type Project, type ProjectMember} from '../project/project'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getProjectsState, resolveProjects} from './projects'

const instance = {} as SanityInstance

test('resolveProjects — default call: features included, members omitted', () => {
  expectTypeOf(resolveProjects(instance)).resolves.toEqualTypeOf<Project<false, true>[]>()
})

test('resolveProjects — includeMembers: true adds members to the type', () => {
  expectTypeOf(resolveProjects(instance, {includeMembers: true})).resolves.toEqualTypeOf<
    Project<true, true>[]
  >()
  type Result = Awaited<ReturnType<typeof resolveProjects<true, true>>>
  expectTypeOf<Result[number]['members']>().toEqualTypeOf<ProjectMember[]>()
})

test('resolveProjects — includeFeatures: false drops features from the type', () => {
  expectTypeOf(resolveProjects(instance, {includeFeatures: false})).resolves.toEqualTypeOf<
    Project<false, false>[]
  >()
})

test('resolveProjects — organizationId alone does not change the data shape', () => {
  expectTypeOf(resolveProjects(instance, {organizationId: 'org_123'})).resolves.toEqualTypeOf<
    Project<false, true>[]
  >()
})

test('getProjectsState — default call returns features-only StateSource', () => {
  expectTypeOf(getProjectsState(instance)).toEqualTypeOf<
    StateSource<Project<false, true>[] | undefined>
  >()
})
