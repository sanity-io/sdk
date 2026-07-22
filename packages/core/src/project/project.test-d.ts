import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type FetcherSnapshot} from '../store/fetcherStore'
import {type Project, project, type ProjectMember} from './project'

const instance = {} as SanityInstance

test('project.resolveState — resolves the wide-boolean detail shape', () => {
  expectTypeOf(project.resolveState(instance, {projectId: 'p'})).resolves.toEqualTypeOf<
    Project<boolean, boolean>
  >()
})

test('Project — literal flags narrow members and features', () => {
  expectTypeOf<Project<true, true>['members']>().toEqualTypeOf<ProjectMember[]>()
  expectTypeOf<Project<true, true>['features']>().toEqualTypeOf<string[]>()
  expectTypeOf<keyof Project<false, false> & ('members' | 'features')>().toEqualTypeOf<never>()
})

test('Project<boolean, boolean> — members and features are optional', () => {
  type Item = Project<boolean, boolean>
  expectTypeOf<Item['members']>().toEqualTypeOf<ProjectMember[] | undefined>()
  expectTypeOf<Item['features']>().toEqualTypeOf<string[] | undefined>()
})

test('project.getState — exposes the snapshot envelope', () => {
  expectTypeOf(project.getState(instance, {projectId: 'p'})).toEqualTypeOf<
    StateSource<FetcherSnapshot<Project<boolean, boolean>>>
  >()
})

test('project — rejects non-boolean flag values', () => {
  // @ts-expect-error includeMembers must be a boolean
  void project.resolveState(instance, {includeMembers: 'yes'})
})
