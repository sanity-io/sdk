import {type SanityInstance} from '../store/createSanityInstance'

/**
 * Parsed intent data from a URL
 * @internal
 */
export interface ParsedIntent {
  /**
   * The name of the intent handler to execute
   */
  intentName: string
  /**
   * The payload to pass to the intent handler
   */
  payload: unknown
}

/**
 * Configuration options for intent handling
 * @public
 */
export interface IntentHandlingOptions {
  /**
   * Base path for intent URLs. Defaults to '/intent'
   */
  basePath?: string
}

/**
 * Parses a URL to extract intent information
 * @param url - The URL to parse
 * @param basePath - The base path for intent URLs (default: '/intent')
 * @returns Parsed intent data or null if URL doesn't match intent pattern
 * @internal
 */
export function parseIntentFromUrl(url: string, basePath = '/intent'): ParsedIntent | null {
  try {
    const parsedUrl = new URL(url)
    const {pathname, searchParams} = parsedUrl

    // Check if pathname starts with the base path
    if (!pathname.startsWith(basePath)) {
      return null
    }

    // Extract intent name from path after base path
    const intentPath = pathname.slice(basePath.length)
    const intentName = intentPath.startsWith('/') ? intentPath.slice(1) : intentPath

    if (!intentName) {
      return null
    }

    // Get payload from search params
    const payloadParam = searchParams.get('payload')
    let payload: unknown

    if (payloadParam) {
      try {
        payload = JSON.parse(decodeURIComponent(payloadParam))
      } catch {
        // If payload parsing fails, use the raw string
        payload = payloadParam
      }
    }

    return {
      intentName,
      payload,
    }
  } catch {
    return null
  }
}

/**
 * Executes an intent handler with the given payload
 * @param instance - The Sanity instance containing intent handlers
 * @param intentName - Name of the intent handler to execute
 * @param payload - Payload to pass to the handler
 * @returns Promise that resolves when the handler completes
 * @internal
 */
export async function executeIntent(
  instance: SanityInstance,
  intentName: string,
  payload: unknown,
): Promise<void> {
  const {intentHandlers} = instance.config

  if (!intentHandlers || typeof intentHandlers[intentName] !== 'function') {
    // eslint-disable-next-line no-console
    console.warn(`Intent handler '${intentName}' not found in configuration`)
    return
  }

  try {
    await intentHandlers[intentName](payload)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Error executing intent handler '${intentName}':`, error)
    throw error
  }
}

/**
 * Handles an intent URL by parsing it and executing the appropriate handler
 * @param instance - The Sanity instance containing intent handlers
 * @param url - The URL to handle
 * @param options - Configuration options
 * @returns Promise that resolves when the intent is handled, or null if no intent found
 * @public
 */
export async function handleIntentUrl(
  instance: SanityInstance,
  url: string,
  options: IntentHandlingOptions = {},
): Promise<boolean> {
  const {basePath = '/intent'} = options

  const parsedIntent = parseIntentFromUrl(url, basePath)
  if (!parsedIntent) {
    return false
  }

  await executeIntent(instance, parsedIntent.intentName, parsedIntent.payload)
  return true
}

/**
 * Default location to use when window.location is not available
 * @internal
 */
const DEFAULT_BASE = 'http://localhost:3000'

/**
 * Gets the current location safely
 * @returns Current location href or default base if not available
 * @internal
 */
export function getCurrentLocation(): string {
  try {
    if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
      return window.location.href
    }
    return DEFAULT_BASE
  } catch {
    return DEFAULT_BASE
  }
}

/**
 * Checks if the current URL contains an intent that should be handled
 * @param instance - The Sanity instance containing intent handlers
 * @param options - Configuration options
 * @returns Promise that resolves to true if an intent was handled
 * @public
 */
export async function checkAndHandleCurrentIntent(
  instance: SanityInstance,
  options: IntentHandlingOptions = {},
): Promise<boolean> {
  const currentUrl = getCurrentLocation()
  return handleIntentUrl(instance, currentUrl, options)
}
