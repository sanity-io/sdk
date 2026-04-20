import {defineEvent} from '@sanity/telemetry'

/** @internal */
export const SDKDevSessionStarted = defineEvent<{
  version: string
  projectId: string
  perspective: string
  authMethod: string
}>({
  name: 'SDK Dev Session Started',
  version: 1,
  description: 'SDK instance created in development mode',
})

/** @internal */
export const SDKHookMounted = defineEvent<{
  hookName: string
}>({
  name: 'SDK Hook Mounted',
  version: 1,
  description: 'An SDK hook was mounted for the first time in this session',
})

/** @internal */
export const SDKDevSessionEnded = defineEvent<{
  durationSeconds: number
  hooksUsed: string[]
}>({
  name: 'SDK Dev Session Ended',
  version: 1,
  description: 'SDK instance disposed in development mode',
})

/** @internal */
export const SDKDevError = defineEvent<{
  errorType: string
  hookName: string
}>({
  name: 'SDK Dev Error',
  version: 1,
  description: 'Runtime error caught during SDK development',
})
