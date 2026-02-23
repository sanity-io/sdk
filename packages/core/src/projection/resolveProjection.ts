import {filter, firstValueFrom} from 'rxjs'

import {bindActionBySourceAndPerspective} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {getProjectionState, type ProjectionOptions} from './getProjectionState'
import {projectionStore} from './projectionStore'
import {type ProjectionValuePending} from './types'

/** @beta */
export function resolveProjection<TData extends object>(
  instance: SanityInstance,
  options: ProjectionOptions,
): Promise<ProjectionValuePending<TData>>

/** @beta */
export function resolveProjection(
  ...args: Parameters<typeof _resolveProjection>
): ReturnType<typeof _resolveProjection> {
  return _resolveProjection(...args)
}

/**
 * @beta
 */
const _resolveProjection = bindActionBySourceAndPerspective(
  projectionStore,
  (
    {instance}: {instance: SanityInstance},
    options: ProjectionOptions,
  ): Promise<ProjectionValuePending<Record<string, unknown>>> =>
    firstValueFrom(
      getProjectionState<Record<string, unknown>>(instance, options).observable.pipe(
        filter((state): state is ProjectionValuePending<Record<string, unknown>> => !!state?.data),
      ),
    ),
)
