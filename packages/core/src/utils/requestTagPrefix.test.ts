import {describe, expect, it} from 'vitest'

import {resolveRequestTagPrefix} from './requestTagPrefix'

describe('resolveRequestTagPrefix', () => {
  it('returns sanity.sdk when no prefix is configured', () => {
    expect(resolveRequestTagPrefix()).toBe('sanity.sdk')
    expect(resolveRequestTagPrefix(undefined)).toBe('sanity.sdk')
    expect(resolveRequestTagPrefix('')).toBe('sanity.sdk')
    expect(resolveRequestTagPrefix('...')).toBe('sanity.sdk')
  })

  it('appends the configured segment under sanity.sdk', () => {
    expect(resolveRequestTagPrefix('workbench')).toBe('sanity.sdk.workbench')
    expect(resolveRequestTagPrefix('workbench.editor')).toBe('sanity.sdk.workbench.editor')
    expect(resolveRequestTagPrefix('.workbench.')).toBe('sanity.sdk.workbench')
  })

  it('does not duplicate a leading sanity.sdk prefix', () => {
    expect(resolveRequestTagPrefix('sanity.sdk')).toBe('sanity.sdk')
    expect(resolveRequestTagPrefix('sanity.sdk.workbench')).toBe('sanity.sdk.workbench')
    expect(resolveRequestTagPrefix('sanity.sdk2')).toBe('sanity.sdk.sanity.sdk2')
  })

  it('appends subsystem segments after the configured prefix', () => {
    expect(resolveRequestTagPrefix(undefined, 'auth')).toBe('sanity.sdk.auth')
    expect(resolveRequestTagPrefix('workbench', 'auth')).toBe('sanity.sdk.workbench.auth')
    expect(resolveRequestTagPrefix('sanity.sdk.workbench', 'auth')).toBe(
      'sanity.sdk.workbench.auth',
    )
  })
})
