import {
  type ActionsResult,
  applyActions,
  type ApplyActionsOptions,
  type DocumentAction,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'

import {createCallbackHook} from '../helpers/createCallbackHook'

/** @beta */
export function useApplyActions(): <TDocument extends SanityDocument>(
  action: DocumentAction<TDocument> | DocumentAction<TDocument>[],
  options?: ApplyActionsOptions,
) => Promise<ActionsResult<TDocument>>
/** @beta */
export function useApplyActions(): (
  action: DocumentAction | DocumentAction[],
  options?: ApplyActionsOptions,
) => Promise<ActionsResult> {
  return _useApplyActions()
}

const _useApplyActions = createCallbackHook(applyActions)
