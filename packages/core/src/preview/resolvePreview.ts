import {filter, firstValueFrom} from 'rxjs'

import {type DocumentHandle} from '../config/sanityConfig'
import {bindActionByDataset} from '../store/createActionBinder'
import {getPreviewState} from './getPreviewState'
import {previewStore} from './previewStore'

/**
 * @beta
 */
export type ResolvePreviewOptions = DocumentHandle

/**
 * @beta
 */
export const resolvePreview = bindActionByDataset(
  previewStore,
  ({instance}, docHandle: ResolvePreviewOptions) =>
    firstValueFrom(getPreviewState(instance, docHandle).observable.pipe(filter((i) => !!i.data))),
)
