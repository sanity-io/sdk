import {getEnv} from '../utils/getEnv'
import {type PreviewValue, type ValuePending} from './previewStore'

export const PREVIEW_TAG = 'preview'
export const PREVIEW_PERSPECTIVE = 'drafts'
export const STABLE_EMPTY_PREVIEW: ValuePending<PreviewValue> = {data: null, isPending: false}
export const STABLE_ERROR_PREVIEW: ValuePending<PreviewValue> = {
  data: {
    title: 'Preview Error',
    ...(!!getEnv('DEV') && {subtitle: 'Check the console for more details'}),
  },
  isPending: false,
}
