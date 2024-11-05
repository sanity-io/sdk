import {useSanitySdk} from './sanitySdkStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sdkState: any = useSanitySdk.getState()

/** @public */
export const setSchema = sdkState.setSchema

/** @public */
export const schemaTestSubscribe = (): void => {
  // eslint-disable-next-line no-console, @typescript-eslint/no-explicit-any
  useSanitySdk.subscribe((state: any) => console.log('[+] Schema State updated', state.schema))
}

export {testFunction} from './example/example'
