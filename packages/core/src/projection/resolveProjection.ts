import {type SanityProjectionResult} from 'groq'
import {filter, firstValueFrom} from 'rxjs'

import {bindActionByDataset} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {getProjectionState, type ProjectionOptions} from './getProjectionState'
import {projectionStore} from './projectionStore'
import {type ProjectionValuePending, type ValidProjection} from './types'

/** @beta */
export function resolveProjection<
  TProjection extends ValidProjection = ValidProjection,
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  options: ProjectionOptions<TProjection, TDocumentType, TDataset, TProjectId>,
): Promise<
  ProjectionValuePending<
    SanityProjectionResult<TProjection, TDocumentType, `${TProjectId}.${TDataset}`>
  >
>

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
const _resolveProjection = bindActionByDataset(
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
