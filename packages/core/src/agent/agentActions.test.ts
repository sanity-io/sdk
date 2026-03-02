/* eslint-disable @typescript-eslint/no-explicit-any */
import {firstValueFrom, of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {
  agentGenerate,
  agentPatch,
  agentPrompt,
  agentTransform,
  agentTranslate,
} from './agentActions'

let mockClient: any
const mockGetClientState = vi.fn()

vi.mock('../client/clientStore', () => {
  return {
    getClientState: (...args: unknown[]) => mockGetClientState(...args),
  }
})

const testResource = {projectId: 'p', dataset: 'd'}

describe('agent actions', () => {
  beforeEach(() => {
    mockClient = {
      observable: {
        agent: {
          action: {
            generate: vi.fn(),
            transform: vi.fn(),
            translate: vi.fn(),
          },
        },
      },
      agent: {
        action: {
          prompt: vi.fn(),
          patch: vi.fn(),
        },
      },
    }
    mockGetClientState.mockReturnValue({observable: of(mockClient)})
  })

  it('agentGenerate passes resource to getClientState and strips it from agent options', async () => {
    mockClient.observable.agent.action.generate.mockReturnValue(of('gen'))
    const instance = {config: {}} as any
    const value = await firstValueFrom(
      agentGenerate(instance, {foo: 'bar', resource: testResource} as any),
    )
    expect(value).toBe('gen')
    expect(mockGetClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      resource: testResource,
    })
    expect(mockClient.observable.agent.action.generate).toHaveBeenCalledWith({foo: 'bar'})
  })

  it('agentTransform passes resource to getClientState and strips it from agent options', async () => {
    mockClient.observable.agent.action.transform.mockReturnValue(of('xform'))
    const instance = {config: {}} as any
    const value = await firstValueFrom(
      agentTransform(instance, {a: 1, resource: testResource} as any),
    )
    expect(value).toBe('xform')
    expect(mockGetClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      resource: testResource,
    })
    expect(mockClient.observable.agent.action.transform).toHaveBeenCalledWith({a: 1})
  })

  it('agentTranslate passes resource to getClientState and strips it from agent options', async () => {
    mockClient.observable.agent.action.translate.mockReturnValue(of('xlate'))
    const instance = {config: {}} as any
    const value = await firstValueFrom(
      agentTranslate(instance, {b: 2, resource: testResource} as any),
    )
    expect(value).toBe('xlate')
    expect(mockGetClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      resource: testResource,
    })
    expect(mockClient.observable.agent.action.translate).toHaveBeenCalledWith({b: 2})
  })

  it('agentPrompt passes resource to getClientState and strips it from agent options', async () => {
    mockClient.agent.action.prompt.mockResolvedValue('prompted')
    const instance = {config: {}} as any
    const value = await firstValueFrom(
      agentPrompt(instance, {p: true, resource: testResource} as any),
    )
    expect(value).toBe('prompted')
    expect(mockGetClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      resource: testResource,
    })
    expect(mockClient.agent.action.prompt).toHaveBeenCalledWith({p: true})
  })

  it('agentPatch passes resource to getClientState and strips it from agent options', async () => {
    mockClient.agent.action.patch.mockResolvedValue('patched')
    const instance = {config: {}} as any
    const value = await firstValueFrom(
      agentPatch(instance, {q: false, resource: testResource} as any),
    )
    expect(value).toBe('patched')
    expect(mockGetClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      resource: testResource,
    })
    expect(mockClient.agent.action.patch).toHaveBeenCalledWith({q: false})
  })

  it('works without an explicit resource (falls back via getClientState)', async () => {
    mockClient.observable.agent.action.generate.mockReturnValue(of('gen'))
    const instance = {config: {}} as any
    await firstValueFrom(agentGenerate(instance, {foo: 'bar'} as any))
    expect(mockGetClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'vX',
      resource: undefined,
    })
  })
})
