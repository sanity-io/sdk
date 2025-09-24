import {filter, firstValueFrom} from 'rxjs'

import {bindActionByDataset} from '../store/createActionBinder'
import {getPreviewState, type GetPreviewStateOptions} from './getPreviewState'
import {previewStore} from './previewStore'

/**
 * @beta
 */
export type ResolvePreviewOptions = GetPreviewStateOptions

/**
 * @beta
 */
export const resolvePreview = bindActionByDataset(
  previewStore,
  ({instance}, docHandle: ResolvePreviewOptions) =>
    firstValueFrom(getPreviewState(instance, docHandle).observable.pipe(filter((i) => !!i.data))),
)
