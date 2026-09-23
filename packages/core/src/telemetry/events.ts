import {defineEvent} from '@sanity/telemetry'

/**
 * Whether the instance has Studio configuration. Apps include Dashboard and standalone apps.
 * This describes instance configuration, not credential source or who authored a hook call.
 * @internal
 */
export type TelemetryRuntimeContext = 'studio' | 'app'

// Keep attribution in event data to preserve the warehouse's data_auth_method convention.
interface TelemetryAttribution {
  /** Configured credential source (token/studio/default), distinct from getAuthMethodState's transport. */
  authMethod: string
  runtimeContext: TelemetryRuntimeContext
}

/** @internal */
export const SDKSessionStarted = defineEvent<
  TelemetryAttribution & {
    version: string
    projectId: string
    perspective: string
  }
>({
  name: 'SDK Session Started',
  version: 1,
  description: 'SDK instance created (environment is recorded in the event context)',
})

/** @internal */
export const SDKHookMounted = defineEvent<
  TelemetryAttribution & {
    hookName: string
  }
>({
  name: 'SDK Hook Mounted',
  version: 1,
  description: 'An SDK hook was mounted for the first time in this session',
})

/** @internal */
export const SDKSessionEnded = defineEvent<
  TelemetryAttribution & {
    durationSeconds: number
    hooksUsed: string[]
  }
>({
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
