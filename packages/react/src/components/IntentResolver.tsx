import {type DocumentHandle} from '@sanity/sdk'
import React, {type ReactNode, Suspense, useEffect, useRef, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

/**
 * @public
 */
export interface IntentHandlerPayload {
  documentHandle: DocumentHandle
  params?: Record<string, string>
}

interface IntentHandler<TPayload = IntentHandlerPayload> {
  type: 'async' | 'component'
  handler: AsyncIntentHandler<TPayload> | ComponentIntentHandler<TPayload>
  hideApp?: boolean
}

// Enhanced intent handler types
type AsyncIntentHandler<TPayload = IntentHandlerPayload> = (payload: TPayload) => Promise<void>
type ComponentIntentHandler<TPayload = IntentHandlerPayload> = (props: {
  payload: TPayload
}) => React.ReactElement

/**
 * @public
 */
export type IntentHandlers = {
  [intentName: string]: IntentHandler
}

interface IntentResolverProps {
  handlers?: IntentHandlers
  children: ReactNode
}

interface ParsedIntent {
  intentName: string
  payload: IntentHandlerPayload
}

// this one's a bit odd and maybe could rise to be a a store in ResourceProvider
let globalIntentState: ParsedIntent | null = null
let hasInterceptedUrl = false

// Parse intent from URLs - support both /intent/ and /intents/ patterns
function parseIntentFromUrl(url: string): ParsedIntent | null {
  try {
    const parsedUrl = new URL(url)
    const {pathname, searchParams} = parsedUrl

    const intentPatterns = ['/intent/', '/intents/']
    let matchedPattern: string | null = null

    for (const pattern of intentPatterns) {
      if (pathname.startsWith(pattern)) {
        matchedPattern = pattern
        break
      }
    }

    if (!matchedPattern) {
      return null
    }

    const intentPath = pathname.slice(matchedPattern.length)
    let intentName = intentPath.startsWith('/') ? intentPath.slice(1) : intentPath

    // Remove trailing slash if present
    intentName = intentName.endsWith('/') ? intentName.slice(0, -1) : intentName

    if (!intentName) {
      return null
    }

    const payloadParam = searchParams.get('payload')
    let payload: IntentHandlerPayload

    if (!payloadParam) {
      throw new Error('No payload found in URL')
    }

    const decoded = decodeURIComponent(payloadParam)

    try {
      const firstParse = JSON.parse(decoded)

      // If first parse result is a string, it means we have double-encoded JSON (comes from Dashboard)
      if (typeof firstParse === 'string') {
        payload = JSON.parse(firstParse)
      } else {
        payload = firstParse
      }
    } catch (error) {
      throw new Error(
        `Invalid payload format: expected JSON but got "${payloadParam}". Error: ${error}`,
      )
    }

    return {
      intentName,
      payload,
    }
  } catch {
    return null
  }
}

function interceptIntentUrl(): void {
  if (typeof window === 'undefined' || hasInterceptedUrl) {
    return
  }

  const currentUrl = window.location.href
  const intentData = parseIntentFromUrl(currentUrl)

  if (intentData) {
    // Store the intent data globally
    globalIntentState = intentData
    hasInterceptedUrl = true

    // Immediately clean up URL to prevent router conflicts
    const url = new URL(currentUrl)
    const searchParams = new URLSearchParams(url.search)

    // Remove intent-related parameters
    searchParams.delete('intent')
    searchParams.delete('payload')

    // For path-based intents, redirect to root
    const isPathBasedIntent = url.pathname.startsWith('/intent')
    const newPath = isPathBasedIntent ? '/' : url.pathname

    const cleanUrl = newPath + (searchParams.toString() ? '?' + searchParams.toString() : '')

    // Immediately replace the URL
    window.history.replaceState({}, '', cleanUrl)
  }
}

// Run global interception immediately when this module loads
interceptIntentUrl()

function HandlerExecutor({
  intentName,
  payload,
  handlers,
  onAsyncComplete,
}: {
  intentName: string
  payload: unknown
  handlers: IntentHandlers
  onAsyncComplete?: () => void
}) {
  const [renderResult, setRenderResult] = useState<ReactNode>()

  useEffect(() => {
    const handlerConfig = handlers[intentName]
    if (!handlerConfig) {
      // eslint-disable-next-line no-console
      console.warn(`Intent handler '${intentName}' not found in handlers:`, Object.keys(handlers))
      return
    }

    const {type, handler} = handlerConfig

    if (type === 'async') {
      // Execute async handler
      const asyncHandler = handler as AsyncIntentHandler
      asyncHandler(payload as IntentHandlerPayload)
        .then(() => {
          // Notify that async operation completed
          onAsyncComplete?.()
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.error(`Error executing intent handler '${intentName}':`, error)
          // Still call completion callback even on error
          onAsyncComplete?.()
        })
      setRenderResult(null)
    } else if (type === 'component') {
      // Execute component handler using React.createElement so hooks work properly
      const componentHandler = handler as ComponentIntentHandler
      try {
        // Pass payload as a prop to the component
        const jsxResult = React.createElement(componentHandler, {
          payload: payload as IntentHandlerPayload,
        })
        setRenderResult(jsxResult)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Error executing intent handler '${intentName}':`, error)
        setRenderResult(null)
      }
    }
  }, [intentName, payload, handlers, onAsyncComplete])

  return <>{renderResult}</>
}

function IntentHandlerWrapper({
  intentName,
  payload,
  handlers,
  onAsyncComplete,
}: {
  intentName: string
  payload: unknown
  handlers: IntentHandlers
  onAsyncComplete?: () => void
}) {
  // Execute in the current ResourceProvider context (from SanityApp)
  // No need to create a new ResourceProvider since the app already has one configured
  return (
    <HandlerExecutor
      intentName={intentName}
      payload={payload}
      handlers={handlers}
      onAsyncComplete={onAsyncComplete}
    />
  )
}

function ErrorFallback({error}: {error: Error}) {
  return (
    <div style={{padding: '20px', border: '1px solid red', margin: '20px'}}>
      <h2>Intent Handler Error</h2>
      <details>
        <summary>Error details</summary>
        <pre>{error.message}</pre>
      </details>
    </div>
  )
}

export function IntentResolver({handlers, children}: IntentResolverProps): ReactNode {
  // Initialize state immediately with global intent state to prevent flash
  const [intentState, setIntentState] = useState<ParsedIntent | null>(() => {
    if (globalIntentState && handlers) {
      return globalIntentState
    }
    return null
  })

  const [isProcessingAsyncIntent, setIsProcessingAsyncIntent] = useState(() => {
    // Also initialize async processing state immediately
    if (globalIntentState && handlers) {
      const handler = handlers[globalIntentState.intentName]
      const isAsync = handler?.type === 'async'
      // Clear global state after using it
      globalIntentState = null
      return isAsync
    }
    return false
  })

  const hasInitialized = useRef(false)

  // Handle cases where handlers arrive after global intent state was captured
  useEffect(() => {
    if (!handlers || hasInitialized.current || intentState) return

    hasInitialized.current = true

    if (globalIntentState) {
      setIntentState(globalIntentState)

      // Check if this is an async intent to determine initial processing state
      const handler = handlers[globalIntentState.intentName]
      if (handler?.type === 'async') {
        setIsProcessingAsyncIntent(true)
      }

      // Clear global state after using it
      globalIntentState = null
    }
  }, [handlers, intentState])

  // Handle navigation to new intent URLs after initial load
  useEffect(() => {
    if (!handlers) return

    const handleUrlChange = () => {
      const intentData = parseIntentFromUrl(window.location.href)
      if (intentData) {
        setIntentState(intentData)

        // Check if this is an async intent
        const handler = handlers[intentData.intentName]
        if (handler?.type === 'async') {
          setIsProcessingAsyncIntent(true)
        }
      }
    }

    // Listen for navigation events
    window.addEventListener('popstate', handleUrlChange)

    return () => {
      window.removeEventListener('popstate', handleUrlChange)
    }
  }, [handlers])

  // Callback for when async intent processing completes
  const handleAsyncComplete = () => {
    setIsProcessingAsyncIntent(false)
    // Clear the intent state immediately since async intents should handle their own navigation
    setIntentState(null)
  }

  // If we have an intent to process, show the handler wrapper
  if (intentState && handlers) {
    const handler = handlers[intentState.intentName]
    const isAsyncHandler = handler?.type === 'async'

    const shouldHideApp = handler?.hideApp ?? (isAsyncHandler ? true : false)
    const showChildren = !isProcessingAsyncIntent && !shouldHideApp

    return (
      <Suspense fallback={<div>Processing intent...</div>}>
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <IntentHandlerWrapper
            intentName={intentState.intentName}
            payload={intentState.payload}
            handlers={handlers}
            onAsyncComplete={isAsyncHandler ? handleAsyncComplete : undefined}
          />
        </ErrorBoundary>
        {/* Conditionally render children based on intent configuration and processing state */}
        {showChildren && children}
      </Suspense>
    )
  }

  // Otherwise, render children normally
  return <>{children}</>
}
