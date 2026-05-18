import {defineEvent} from '@sanity/telemetry'

/** @internal */
export const SDKSessionStarted = defineEvent<{
  version: string
  projectId: string
  perspective: string
  authMethod: string
}>({
  name: 'SDK Session Started',
  version: 1,
  description: 'SDK instance created (environment is recorded in the event context)',
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
export const SDKSessionEnded = defineEvent<{
  durationSeconds: number
  hooksUsed: string[]
}>({
  name: 'SDK Session Ended',
  version: 1,
  description: 'SDK instance disposed (environment is recorded in the event context)',
})

/** @internal */
export const SDKError = defineEvent<{
  errorType: string
  hookName: string
}>({
  name: 'SDK Error',
  version: 1,
  description: 'Runtime error caught in the SDK',
})
