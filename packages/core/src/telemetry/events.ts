import {defineEvent} from '@sanity/telemetry'

/**
 * Whether the instance has Studio configuration. Apps include Dashboard and standalone apps.
 * This describes instance configuration, not credential source or who authored a hook call.
 * @internal
 */
export type TelemetryRuntimeContext = 'studio' | 'app'

/** @internal */
export const SDKSessionStarted = defineEvent<{
  version: string
  projectId: string
  perspective: string
  authMethod: string
  runtimeContext: TelemetryRuntimeContext
}>({
  name: 'SDK Session Started',
  version: 1,
  description: 'SDK instance created (environment is recorded in the event context)',
})

/** @internal */
export const SDKHookMounted = defineEvent<{
  hookName: string
  authMethod: string
  runtimeContext: TelemetryRuntimeContext
}>({
  name: 'SDK Hook Mounted',
  version: 1,
  description: 'An SDK hook was mounted for the first time in this session',
})

/** @internal */
export const SDKSessionEnded = defineEvent<{
  durationSeconds: number
  hooksUsed: string[]
  authMethod: string
  runtimeContext: TelemetryRuntimeContext
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
