import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ActionError} from '../document/processActions/shared'
import {createErrorReporter} from './errorReporter'
import {markSdkError} from './sdkErrorOrigin'

type SentPayload = {
  release?: string
  environment?: string
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  breadcrumbs?: unknown[]
  user?: {ip_address?: string}
}

const SDK_FRAME = 'https://sanity-cdn.com/v1/modules/@sanity__sdk-react/default/%5E1.0.0/index.js'
const APP_FRAME = 'https://myapp.example.com/assets/main.js'
const BUILTIN_FRAME = '<anonymous>'
/** A frame in an app that bundles the SDK, so the URL does not name the SDK. */
const BUNDLE_FRAME = 'https://myapp.example.com/assets/index-abc123.js'

function errorWithStack(message: string, frames: string[]): Error {
  const error = new TypeError(message)
  const lines = frames.map((f) =>
    f === BUILTIN_FRAME ? '    at JSON.parse (<anonymous>)' : `    at fn (${f}:10:5)`,
  )
  error.stack = `TypeError: ${message}\n${lines.join('\n')}`
  return error
}

function setup() {
  const sent: SentPayload[] = []
  const transport = (() => ({
    send: async (envelope: unknown[]) => {
      for (const [, payload] of envelope[1] as [unknown, SentPayload][]) sent.push(payload)
      return {statusCode: 200}
    },
    flush: async () => true,
  })) as never
  const {reportError} = createErrorReporter({transport})
  // `reportError` loads Sentry lazily and sends in the background
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100))
  return {sent, reportError, settle}
}

describe('createErrorReporter', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {location: {hostname: 'myapp.example.com'}})
    vi.stubGlobal('document', {
      querySelectorAll: () => [{textContent: JSON.stringify({imports: {'@sanity/sdk': 'x'}})}],
    })
    vi.stubGlobal('localStorage', {getItem: () => null})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends nothing when error reporting is disabled', async () => {
    vi.stubGlobal('window', {location: {hostname: 'localhost'}})
    const {sent, reportError, settle} = setup()
    reportError(errorWithStack('boom', [SDK_FRAME]))
    await settle()
    expect(sent).toHaveLength(0)
  })

  it('sends nothing for a known error', async () => {
    const {sent, reportError, settle} = setup()
    const error = new ActionError({message: 'm', documentId: 'd', transactionId: 't'})
    error.stack = `Error: m\n    at fn (${SDK_FRAME}:1:1)`
    reportError(error)
    await settle()
    expect(sent).toHaveLength(0)
  })

  it('sends nothing for a value that is not an Error', async () => {
    const {sent, reportError, settle} = setup()
    reportError('just a string')
    await settle()
    expect(sent).toHaveLength(0)
  })

  it('sends a scrubbed event with tags for an SDK error', async () => {
    const {sent, reportError, settle} = setup()
    reportError(errorWithStack('boom', [SDK_FRAME, APP_FRAME]), {errorBoundary: 'AuthBoundary'})
    await settle()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.tags).toMatchObject({handled: 'no', errorBoundary: 'AuthBoundary'})
    expect(sent[0]?.user).toEqual({ip_address: '0.0.0.0'})
    expect(sent[0]?.release).toEqual(expect.any(String))
  })

  it('drops errors thrown by app code', async () => {
    const {sent, reportError, settle} = setup()
    reportError(errorWithStack('app only', [APP_FRAME]))
    reportError(errorWithStack('sdk called app', [APP_FRAME, SDK_FRAME]))
    await settle()
    expect(sent).toHaveLength(0)
  })

  it('reports the same message once', async () => {
    const {sent, reportError, settle} = setup()
    reportError(errorWithStack('repeat', [SDK_FRAME]))
    reportError(errorWithStack('repeat', [SDK_FRAME]))
    await settle()
    expect(sent).toHaveLength(1)
  })

  it('attributes an error thrown by a builtin to the code that called it', async () => {
    const {sent, reportError, settle} = setup()
    reportError(errorWithStack('sdk parse', [BUILTIN_FRAME, SDK_FRAME]))
    reportError(errorWithStack('app parse', [BUILTIN_FRAME, APP_FRAME]))
    await settle()
    expect(sent).toHaveLength(1)
  })

  it('matches a percent-encoded module server URL', async () => {
    const {sent, reportError, settle} = setup()
    reportError(
      errorWithStack('encoded', [
        'https://sanity-cdn.com/v1/modules/%40sanity__sdk/default/1/a.mjs',
      ]),
    )
    await settle()
    expect(sent).toHaveLength(1)
  })

  it('does not match a similar package name or an app path that looks like this repo', async () => {
    const {sent, reportError, settle} = setup()
    reportError(errorWithStack('other package', ['https://cdn.example.com/@sanity/sdk-other/a.js']))
    reportError(
      errorWithStack('app monorepo', ['https://myapp.example.com/packages/core/src/a.ts']),
    )
    await settle()
    expect(sent).toHaveLength(0)
  })

  it('matches this repo sources only when the debug flag is set', async () => {
    vi.stubGlobal('localStorage', {getItem: () => '1'})
    const {sent, reportError, settle} = setup()
    reportError(
      errorWithStack('dev source', ['http://localhost:3333/@fs/repo/packages/react/src/a.ts']),
    )
    await settle()
    expect(sent).toHaveLength(1)
  })

  it('reports distinct errors that wrap the same cause', async () => {
    const {sent, reportError, settle} = setup()
    const cause = errorWithStack('shared cause', [SDK_FRAME])
    for (const message of ['first', 'second']) {
      const error = errorWithStack(message, [SDK_FRAME])
      error.cause = cause
      reportError(error)
    }
    await settle()
    expect(sent).toHaveLength(2)
  })

  it('leaves the error it was given unmarked, so a host Sentry can still capture it', async () => {
    const {sent, reportError, settle} = setup()
    const appError = errorWithStack('app error', [APP_FRAME])
    const sdkError = errorWithStack('sdk error', [SDK_FRAME])
    reportError(appError)
    reportError(sdkError)
    await settle()
    expect(sent).toHaveLength(1)
    expect(Object.hasOwn(appError, '__sentry_captured__')).toBe(false)
    expect(Object.hasOwn(sdkError, '__sentry_captured__')).toBe(false)
  })

  it('does not send state from a Sentry instance the host page runs', async () => {
    const hostSentry = await import('@sentry/browser')
    hostSentry.setTag('customer_tag', 'secret-tenant')
    hostSentry.setExtra('cart', 'items')
    hostSentry.addBreadcrumb({message: 'clicked buy for customer X'})
    try {
      const {sent, reportError, settle} = setup()
      reportError(errorWithStack('sdk bug', [SDK_FRAME]), {errorBoundary: 'AuthBoundary'})
      await settle()

      expect(sent).toHaveLength(1)
      expect(sent[0]?.tags).toEqual({
        handled: 'no',
        delivery: 'auto-updates',
        errorBoundary: 'AuthBoundary',
      })
      expect(sent[0]?.extra).toBeUndefined()
      expect(sent[0]?.breadcrumbs).toBeUndefined()
    } finally {
      const hostScope = hostSentry.getIsolationScope()
      hostScope.setTag('customer_tag', undefined)
      hostScope.setExtra('cart', undefined)
      hostScope.clearBreadcrumbs()
    }
  })

  it('does not throw when inspecting the error throws', () => {
    const {reportError} = setup()
    const error = new Error('hostile')
    Object.defineProperty(error, 'cause', {
      get() {
        throw new Error('cause getter')
      },
    })
    expect(() => reportError(error)).not.toThrow()
  })

  it('stops after 10 events from one reporter', async () => {
    const {sent, reportError, settle} = setup()
    for (let i = 0; i < 20; i++) reportError(errorWithStack(`distinct ${i}`, [SDK_FRAME]))
    await settle()
    expect(sent).toHaveLength(10)
  })

  it('sends a marked error even when its frames are all in an app bundle', async () => {
    const {sent, reportError, settle} = setup()
    const error = errorWithStack('sdk bug in bundle', [BUNDLE_FRAME])
    markSdkError(error)
    reportError(error)
    await settle()
    expect(sent).toHaveLength(1)
    expect(JSON.stringify(sent[0])).not.toContain('errorOrigin')
  })

  it('labels a local host as development when the debug flag turns reporting on', async () => {
    vi.stubGlobal('window', {location: {hostname: 'my-app.localhost'}})
    vi.stubGlobal('localStorage', {getItem: () => '1'})
    const {sent, reportError, settle} = setup()
    reportError(errorWithStack('local', [SDK_FRAME]))
    await settle()
    expect(sent[0]?.environment).toBe('development')
  })

  it('tags an app without an @sanity/sdk import map entry as bundled', async () => {
    vi.stubGlobal('document', {querySelectorAll: () => []})
    const {sent, reportError, settle} = setup()
    const error = errorWithStack('sdk bug in bundle', [BUNDLE_FRAME])
    markSdkError(error)
    reportError(error)
    await settle()
    expect(sent[0]?.tags).toMatchObject({delivery: 'bundled'})
  })

  it('dedupes app errors that wrap the same SDK error by the SDK error message', async () => {
    const {sent, reportError, settle} = setup()
    for (const user of ['a@example.com', 'b@example.com', 'c@example.com']) {
      const sdkError = errorWithStack('sdk root', [BUNDLE_FRAME])
      markSdkError(sdkError)
      const appError = errorWithStack(`failed for ${user}`, [BUNDLE_FRAME])
      appError.cause = sdkError
      reportError(appError)
    }
    await settle()
    expect(sent).toHaveLength(1)
  })

  it('drops an unmarked error whose frames are all in an app bundle', async () => {
    const {sent, reportError, settle} = setup()
    reportError(errorWithStack('app bug in bundle', [BUNDLE_FRAME]))
    await settle()
    expect(sent).toHaveLength(0)
  })

  it('sends an app error whose cause is a marked SDK error', async () => {
    const {sent, reportError, settle} = setup()
    const sdkError = errorWithStack('sdk root', [BUNDLE_FRAME])
    markSdkError(sdkError)
    const appError = errorWithStack('app wrapper', [BUNDLE_FRAME])
    appError.cause = sdkError
    reportError(appError)
    await settle()
    expect(sent).toHaveLength(1)
  })
})
