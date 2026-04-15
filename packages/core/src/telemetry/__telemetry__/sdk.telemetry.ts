import {defineEvent} from '@sanity/telemetry'

/** @internal */
export const SDKDevSessionStarted = defineEvent<{
  sdkVersion: string
  projectId: string
  perspective: string
  authMethod: string
  origin: string
  nodeEnv: string
}>({
  name: 'SDK Dev Session Started',
  version: 1,
  description: 'SDK instance created in development mode',
})

/** @internal */
export const SDKHookFirstUsed = defineEvent<{
  hookName: string
}>({
  name: 'SDK Hook First Used',
  version: 1,
  description: 'First use of a specific SDK hook type in this session',
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
  hookContext: string
}>({
  name: 'SDK Dev Error',
  version: 1,
  description: 'Runtime error caught during SDK development',
})
