import {expectTypeOf, test} from 'vitest'

import {type Project, type ProjectMember} from '../project/project'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type FetcherSnapshot} from '../store/fetcherStore'
import {projects} from './projects'

const instance = {} as SanityInstance

test('projects.resolveState — resolves the wide-boolean list shape', () => {
  expectTypeOf(projects.resolveState(instance)).resolves.toEqualTypeOf<
    Project<boolean, boolean>[]
  >()
})

test('Project<boolean, boolean> — members and features are optional', () => {
  type Item = Project<boolean, boolean>
  expectTypeOf<Item['members']>().toEqualTypeOf<ProjectMember[] | undefined>()
  expectTypeOf<Item['features']>().toEqualTypeOf<string[] | undefined>()
})

test('projects.getState — exposes the snapshot envelope', () => {
  expectTypeOf(projects.getState(instance)).toEqualTypeOf<
    StateSource<FetcherSnapshot<Project<boolean, boolean>[]>>
  >()
})

test('projects — rejects non-boolean flag values', () => {
  // @ts-expect-error includeMembers must be a boolean
  void projects.resolveState(instance, {includeMembers: 'yes'})
})
