import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type FetcherSnapshot} from '../store/fetcherStore'
import {
  type Application,
  application,
  type ApplicationBase,
  type ApplicationDeployment,
  type ApplicationInclude,
  type ApplicationInterface,
  applications,
  type ApplicationsResponse,
  type ApplicationStudioConfig,
} from './applications'

const instance = {} as SanityInstance

type ChildKeys = 'config' | 'activeDeployment'
type DeploymentChildKeys = 'interfaces' | 'workspaces' | 'access'

// Whether key `K` of `T` is optional, without an `{}`-based check.
type KeyModifier<T, K extends keyof T> =
  Pick<T, K> extends Required<Pick<T, K>> ? 'required' : 'optional'

test('Application — no includes: only the base shape, no config or activeDeployment', () => {
  expectTypeOf<Application>().toEqualTypeOf<ApplicationBase>()
  expectTypeOf<Application<never>>().toEqualTypeOf<ApplicationBase>()
  expectTypeOf<Extract<keyof Application, ChildKeys>>().toEqualTypeOf<never>()
})

test('Application — config.studio adds a required config.studio', () => {
  expectTypeOf<
    Application<'config.studio'>['config']['studio']
  >().toEqualTypeOf<ApplicationStudioConfig>()
  // mfManifest not requested → not present under config
  expectTypeOf<
    Extract<keyof Application<'config.studio'>['config'], 'mfManifest'>
  >().toEqualTypeOf<never>()
  // requesting only config does not pull in the deployment
  expectTypeOf<
    Extract<keyof Application<'config.studio'>, 'activeDeployment'>
  >().toEqualTypeOf<never>()
})

test('Application — both config tokens merge under a single config', () => {
  type Config = Application<'config.studio' | 'config.mfManifest'>['config']
  expectTypeOf<Config['studio']>().toEqualTypeOf<ApplicationStudioConfig>()
  expectTypeOf<Config['mfManifest']>().toEqualTypeOf<unknown>()
})

test('Application — activeDeployment token adds the deployment summary, no children', () => {
  expectTypeOf<
    Application<'activeDeployment'>['activeDeployment']
  >().toEqualTypeOf<ApplicationDeployment<'activeDeployment'> | null>()
  type Deployment = NonNullable<Application<'activeDeployment'>['activeDeployment']>
  expectTypeOf<Extract<keyof Deployment, DeploymentChildKeys>>().toEqualTypeOf<never>()
})

test('Application — a child token forces the deployment in and adds only that child', () => {
  type Deployment = NonNullable<Application<'interfaces'>['activeDeployment']>
  expectTypeOf<Deployment['interfaces']>().toEqualTypeOf<ApplicationInterface[]>()
  expectTypeOf<Extract<keyof Deployment, 'workspaces' | 'access'>>().toEqualTypeOf<never>()
})

test('Application — a wide include array makes config and activeDeployment optional', () => {
  type Wide = Application<ApplicationInclude>
  expectTypeOf<KeyModifier<Wide, 'activeDeployment'>>().toEqualTypeOf<'optional'>()
  expectTypeOf<KeyModifier<Wide, 'config'>>().toEqualTypeOf<'optional'>()
})

test('applications.resolveState — resolves the wide list envelope', () => {
  expectTypeOf(
    applications.resolveState(instance, {organizationId: 'org_1'}),
  ).resolves.toEqualTypeOf<ApplicationsResponse<ApplicationInclude>>()
})

test('application.getState — exposes the snapshot envelope', () => {
  expectTypeOf(application.getState(instance, 'app_1')).toEqualTypeOf<
    StateSource<FetcherSnapshot<Application<ApplicationInclude>>>
  >()
})
