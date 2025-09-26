import {describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from './createSanityInstance'

describe('createSanityInstance', () => {
  it('should create an instance with a unique instanceId and given config', () => {
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    expect(typeof instance.instanceId).toBe('string')
    expect(instance.config).toEqual({projectId: 'proj1', dataset: 'ds1'})
    expect(instance.isDisposed()).toBe(false)
  })

  it('should dispose an instance and call onDispose callbacks', () => {
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    const callback = vi.fn()
    instance.onDispose(callback)
    instance.dispose()
    expect(instance.isDisposed()).toBe(true)
    expect(callback).toHaveBeenCalled()
  })

  it('should not call onDispose callbacks more than once when disposed multiple times', () => {
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    const callback = vi.fn()
    instance.onDispose(callback)
    instance.dispose()
    instance.dispose()
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
