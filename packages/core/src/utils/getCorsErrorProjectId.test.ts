/* eslint-disable @typescript-eslint/no-explicit-any */
import {CorsOriginError} from '@sanity/client'
import {afterEach, describe, expect, test} from 'vitest'

import {getCorsErrorProjectId} from './getCorsErrorProjectId'

describe('getCorsErrorProjectId', () => {
  const originalLocation = (globalThis as any).location

  afterEach(() => {
    if (originalLocation === undefined) {
      delete (globalThis as any).location
    } else {
      ;(globalThis as any).location = originalLocation
    }
  })

  test('returns null for non-CorsOriginError', () => {
    const err = new Error(
      'Change your configuration here: https://sanity.io/manage/project/abc123/api',
    )

    expect(getCorsErrorProjectId(err)).toBeNull()
  })

  test('extracts projectId from CorsOriginError in Node environment', () => {
    delete (globalThis as any).location
    const err = new CorsOriginError({projectId: 'abc123'})

    expect(getCorsErrorProjectId(err as unknown as Error)).toBe('abc123')
  })

  test('extracts projectId from CorsOriginError with browser query params', () => {
    ;(globalThis as any).location = {origin: 'https://example.com'}
    const err = new CorsOriginError({projectId: 'p123-xyz'})

    expect(getCorsErrorProjectId(err as unknown as Error)).toBe('p123-xyz')
  })

  test('returns null if CorsOriginError message does not contain manage URL', () => {
    const err = new CorsOriginError({projectId: 'abc123'})
    err.message = 'Some other message without the manage URL'

    expect(getCorsErrorProjectId(err as unknown as Error)).toBeNull()
  })
})
