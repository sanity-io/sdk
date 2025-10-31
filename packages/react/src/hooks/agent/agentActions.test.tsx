/* eslint-disable @typescript-eslint/no-explicit-any */
import {renderHook} from '@testing-library/react'
import {of} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {
  useAgentGenerate,
  useAgentPatch,
  useAgentPrompt,
  useAgentTransform,
  useAgentTranslate,
} from './agentActions'

vi.mock('@sanity/sdk', async (orig) => {
  const actual = await orig()
  return {
    ...(actual as Record<string, any>),
    agentGenerate: vi.fn(() => of('gen')),
    agentTransform: vi.fn(() => of('xform')),
    agentTranslate: vi.fn(() => of('xlate')),
    agentPrompt: vi.fn(() => of('prompted')),
    agentPatch: vi.fn(() => of('patched')),
  }
})

describe('agent action hooks', () => {
  const wrapper = ({children}: {children: React.ReactNode}) => (
    <ResourceProvider projectId="p" dataset="d" fallback={null}>
      {children}
    </ResourceProvider>
  )

  it('useAgentGenerate returns a callable that delegates to core', async () => {
    const {result} = renderHook(() => useAgentGenerate(), {wrapper})
    const value = await new Promise<any>((resolve, reject) => {
      result.current({} as any).subscribe({
        next: (v) => resolve(v),
        error: reject,
      })
    })
    expect(value).toBe('gen')
  })

  it('useAgentTransform returns a callable that delegates to core', async () => {
    const {result} = renderHook(() => useAgentTransform(), {wrapper})
    const value = await new Promise<any>((resolve, reject) => {
      result.current({} as any).subscribe({
        next: (v) => resolve(v),
        error: reject,
      })
    })
    expect(value).toBe('xform')
  })

  it('useAgentTranslate returns a callable that delegates to core', async () => {
    const {result} = renderHook(() => useAgentTranslate(), {wrapper})
    const value = await new Promise<any>((resolve, reject) => {
      result.current({} as any).subscribe({
        next: (v) => resolve(v),
        error: reject,
      })
    })
    expect(value).toBe('xlate')
  })

  it('useAgentPrompt returns a callable that delegates to core', async () => {
    const {result} = renderHook(() => useAgentPrompt(), {wrapper})
    const value = await result.current({} as any)
    expect(value).toBe('prompted')
  })

  it('useAgentPatch returns a callable that delegates to core', async () => {
    const {result} = renderHook(() => useAgentPatch(), {wrapper})
    const value = await result.current({} as any)
    expect(value).toBe('patched')
  })
})
