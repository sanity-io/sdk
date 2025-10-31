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

vi.mock('../client/clientStore', () => {
  return {
    getClientState: () => ({observable: of(mockClient)}),
  }
})

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
  })

  it('agentGenerate returns observable from client', async () => {
    mockClient.observable.agent.action.generate.mockReturnValue(of('gen'))
    const instance = {config: {projectId: 'p', dataset: 'd'}} as any
    const value = await firstValueFrom(agentGenerate(instance, {foo: 'bar'} as any))
    expect(value).toBe('gen')
    expect(mockClient.observable.agent.action.generate).toHaveBeenCalledWith({foo: 'bar'})
  })

  it('agentTransform returns observable from client', async () => {
    mockClient.observable.agent.action.transform.mockReturnValue(of('xform'))
    const instance = {config: {projectId: 'p', dataset: 'd'}} as any
    const value = await firstValueFrom(agentTransform(instance, {a: 1} as any))
    expect(value).toBe('xform')
    expect(mockClient.observable.agent.action.transform).toHaveBeenCalledWith({a: 1})
  })

  it('agentTranslate returns observable from client', async () => {
    mockClient.observable.agent.action.translate.mockReturnValue(of('xlate'))
    const instance = {config: {projectId: 'p', dataset: 'd'}} as any
    const value = await firstValueFrom(agentTranslate(instance, {b: 2} as any))
    expect(value).toBe('xlate')
    expect(mockClient.observable.agent.action.translate).toHaveBeenCalledWith({b: 2})
  })

  it('agentPrompt wraps promise into observable', async () => {
    mockClient.agent.action.prompt.mockResolvedValue('prompted')
    const instance = {config: {projectId: 'p', dataset: 'd'}} as any
    const value = await firstValueFrom(agentPrompt(instance, {p: true} as any))
    expect(value).toBe('prompted')
    expect(mockClient.agent.action.prompt).toHaveBeenCalledWith({p: true})
  })

  it('agentPatch wraps promise into observable', async () => {
    mockClient.agent.action.patch.mockResolvedValue('patched')
    const instance = {config: {projectId: 'p', dataset: 'd'}} as any
    const value = await firstValueFrom(agentPatch(instance, {q: false} as any))
    expect(value).toBe('patched')
    expect(mockClient.agent.action.patch).toHaveBeenCalledWith({q: false})
  })
})
