import {type ApplicationInterface} from '@sanity/sdk'
import {type View, type ViewApplication} from '@sanity/sdk/dashboard'

type ViewInterface = Exclude<ApplicationInterface, {type: 'worker'}>
type ViewOf<T extends ViewInterface> = Extract<
  View,
  {surface: T['type'] extends 'app' ? 'window' : T['type']}
>

/**
 * Maps an interface record to a {@link View}, renaming its `type` to `surface` and `app` to `window`.
 * @internal
 */
export function toView<T extends ViewInterface>({
  type,
  ...record
}: T & {application: ViewApplication}): ViewOf<T> {
  // Brett validates `metadata` per type (src/core/interfaces/validate.ts); the record type doesn't.
  return {...record, surface: type === 'app' ? 'window' : type} as unknown as ViewOf<T>
}
