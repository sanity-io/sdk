import {createSanityInstance} from '@sanity/sdk'
import {type MutationResult} from '@sanity/sdk/_internal'
import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {createMutationHook} from './createMutationHook'

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

const settled = <T,>(data: T): MutationResult<T> => ({data, invalidated: Promise.resolve()})

describe('createMutationHook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSanityInstance).mockReturnValue(instance)
  })

  it('starts idle', () => {
    const useThing = createMutationHook(vi.fn())
    const {result} = renderHook(() => useThing())

    expect(result.current.isPending).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBeUndefined()
  })

  it('calls the mutation with the instance and resolves with the server data', async () => {
    const mutation = vi.fn((_instance, input: string) =>
      Promise.resolve(settled(`created:${input}`)),
    )
    const useThing = createMutationHook(mutation)
    const {result} = renderHook(() => useThing())

    let resolved: string | undefined
    await act(async () => {
      resolved = await result.current.mutate('a')
    })

    expect(mutation).toHaveBeenCalledWith(instance, 'a')
    expect(resolved).toBe('created:a')
    expect(result.current.data).toBe('created:a')
    expect(result.current.error).toBeUndefined()
    expect(result.current.isPending).toBe(false)
  })

  it('reports isPending while the mutation is in flight', async () => {
    let release!: (value: MutationResult<string>) => void
    const mutation = vi.fn(
      () => new Promise<MutationResult<string>>((resolve) => (release = resolve)),
    )
    const useThing = createMutationHook(mutation)
    const {result} = renderHook(() => useThing())

    act(() => {
      void result.current.mutate('a')
    })
    expect(result.current.isPending).toBe(true)

    await act(async () => {
      release(settled('done'))
    })
    expect(result.current.isPending).toBe(false)
    expect(result.current.data).toBe('done')
  })

  it('rejects on failure and captures the error in state', async () => {
    const boom = new Error('nope')
    const mutation = vi.fn(() => Promise.reject(boom))
    const useThing = createMutationHook(mutation)
    const {result} = renderHook(() => useThing())

    await act(async () => {
      await expect(result.current.mutate('a')).rejects.toBe(boom)
    })

    expect(result.current.error).toBe(boom)
    expect(result.current.data).toBeUndefined()
    expect(result.current.isPending).toBe(false)
  })

  it('reset() returns to idle', async () => {
    const mutation = vi.fn((_instance, input: string) => Promise.resolve(settled(input)))
    const useThing = createMutationHook(mutation)
    const {result} = renderHook(() => useThing())

    await act(async () => {
      await result.current.mutate('a')
    })
    expect(result.current.data).toBe('a')

    act(() => result.current.reset())
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBeUndefined()
    expect(result.current.isPending).toBe(false)
  })

  it('only the latest call writes state, so a stale call cannot clobber it', async () => {
    const releases: Array<(value: MutationResult<string>) => void> = []
    const mutation = vi.fn(
      () => new Promise<MutationResult<string>>((resolve) => releases.push(resolve)),
    )
    const useThing = createMutationHook(mutation)
    const {result} = renderHook(() => useThing())

    let first!: Promise<string>
    let second!: Promise<string>
    act(() => {
      first = result.current.mutate('first')
      second = result.current.mutate('second')
    })

    await act(async () => {
      releases[1]!(settled('second-result')) // latest resolves first
      releases[0]!(settled('first-result')) // stale resolves after
      await Promise.all([first, second])
    })

    expect(result.current.data).toBe('second-result')
  })
})
