import {type DocumentHandle} from '@sanity/sdk'
import React, {type ReactNode, Suspense, useEffect, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ResourceProvider} from '../context/ResourceProvider'

// Enhanced intent handler types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncIntentHandler<TPayload = any> = (payload: TPayload) => Promise<void>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentIntentHandler<TPayload = any> = (payload: TPayload) => ReactNode

/**
 * Configuration object for intent handlers that can be either async functions or React components
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IntentHandlerConfig<TPayload = any> =
  | {type: 'async'; handler: AsyncIntentHandler<TPayload>}
  | {type: 'component'; handler: ComponentIntentHandler<TPayload>}

/**
 * Enhanced intent handlers that support both async functions and React components
 * @public
 */
export type EnhancedIntentHandlers = Record<string, IntentHandlerConfig>

interface IntentResolverProps {
  handlers?: EnhancedIntentHandlers
  children: ReactNode
}

interface ParsedIntent {
  intentName: string
  payload: unknown
}

interface IntentState {
  intentName: string
  payload: unknown
}

// just look for a query param called intent
function parseIntentFromUrl(url: string, basePath = '/intent'): ParsedIntent | null {
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

function HandlerExecutor({
  intentName,
  payload,
  handlers,
}: {
  intentName: string
  payload: unknown
  handlers: EnhancedIntentHandlers
}) {
  const [renderResult, setRenderResult] = useState<ReactNode>(null)

  useEffect(() => {
    const handlerConfig = handlers[intentName]
    if (!handlerConfig) {
      // eslint-disable-next-line no-console
      console.warn(`Intent handler '${intentName}' not found`)
      return
    }

    const {type, handler} = handlerConfig

    if (type === 'async') {
      // Execute async handler
      const asyncHandler = handler as AsyncIntentHandler
      asyncHandler(payload).catch((error) => {
        // eslint-disable-next-line no-console
        console.error(`Error executing intent handler '${intentName}':`, error)
      })
      setRenderResult(null)
    } else if (type === 'component') {
      // Execute component handler using React.createElement so hooks work properly
      const componentHandler = handler as ComponentIntentHandler
      try {
        const jsxResult = React.createElement(componentHandler, payload)
        setRenderResult(jsxResult)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Error executing intent handler '${intentName}':`, error)
        setRenderResult(null)
      }
    }
  }, [intentName, payload, handlers])

  return <>{renderResult}</>
}

function IntentHandlerWrapper({
  intentName,
  payload,
  handlers,
}: {
  intentName: string
  payload: unknown
  handlers: EnhancedIntentHandlers
}) {
  // Extract context from payload, assuming it extends DocumentHandle
  const payloadAsHandle = payload as DocumentHandle
  const context = {
    ...(payloadAsHandle?.projectId && {projectId: payloadAsHandle.projectId}),
    ...(payloadAsHandle?.dataset && {dataset: payloadAsHandle.dataset}),
  }

  // If we have context from the payload, wrap execution in ResourceProvider
  // Otherwise, execute in the current context
  if (Object.keys(context).length > 0) {
    return (
      <ResourceProvider {...context} fallback={null}>
        <HandlerExecutor intentName={intentName} payload={payload} handlers={handlers} />
      </ResourceProvider>
    )
  }

  // No specific context needed, execute in current context
  return <HandlerExecutor intentName={intentName} payload={payload} handlers={handlers} />
}

function ErrorFallback({error}: {error: Error}) {
  return (
    <div style={{padding: '20px', border: '1px solid red', backgroundColor: '#ffebee'}}>
      <h2>Intent Processing Error</h2>
      <details>
        <summary>Error details</summary>
        <pre>{error.message}</pre>
      </details>
    </div>
  )
}

/**
 * Component that processes intent handlers from URL parameters and executes them
 * Supports both async function handlers and React component handlers
 * @public
 */
export function IntentResolver({handlers, children}: IntentResolverProps): ReactNode {
  const [intentState, setIntentState] = useState<IntentState | null>(null)

  useEffect(() => {
    // Don't process intents if no handlers are provided
    if (!handlers) return

    // Parse the current URL for intent information
    const intentData = parseIntentFromUrl(window.location.href)
    if (intentData) {
      setIntentState(intentData)
      // Clean up the URL by removing the intent information
      window.history.replaceState(
        {},
        '',
        window.location.pathname +
          window.location.search.replace(/[?&]payload=[^&]*/, '').replace(/^\?$/, ''),
      )
    }
  }, [handlers])

  // If we have an intent to process, show the handler wrapper
  if (intentState && handlers) {
    return (
      <Suspense fallback={<div>Processing intent...</div>}>
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <IntentHandlerWrapper
            intentName={intentState.intentName}
            payload={intentState.payload}
            handlers={handlers}
          />
        </ErrorBoundary>
        {children}
      </Suspense>
    )
  }

  // Otherwise, render children normally
  return <>{children}</>
}
