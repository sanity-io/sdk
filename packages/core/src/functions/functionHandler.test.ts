import {describe, expect, expectTypeOf, it, vi} from 'vitest'

import {functionHandler, type ScheduledFunctionArgs, scheduledHandler} from './functionHandler'

const args = {context: {clientOptions: {}}} as unknown as ScheduledFunctionArgs

describe('functionHandler', () => {
  it('returns the handler unchanged', () => {
    const handler = async () => 'ok'
    expect(functionHandler(handler)).toBe(handler)
  })

  it('rejects a missing handler', () => {
    expect(() => functionHandler(undefined as never)).toThrow('A function handler is required.')
  })
})

describe('scheduledHandler', () => {
  it('carries a literal schedule and timezone at runtime and in its type', async () => {
    const implementation = vi.fn()
    const handler = scheduledHandler(
      {schedule: 'weekdays at 8am', timezone: 'Europe/Oslo'},
      implementation,
    )

    expect(handler.schedule).toBe('weekdays at 8am')
    expect(handler.timezone).toBe('Europe/Oslo')
    expectTypeOf(handler.schedule).toEqualTypeOf<'weekdays at 8am'>()
    expectTypeOf(handler.timezone).toEqualTypeOf<'Europe/Oslo'>()

    await expect(handler(args)).resolves.toBeUndefined()
    expect(implementation).toHaveBeenCalledWith(args)
  })

  it('accepts explicit cron fields and leaves the timezone unset', () => {
    const schedule = {minute: '0', hour: '9', dayOfMonth: '*', month: '*', dayOfWeek: '1-5'}
    const handler = scheduledHandler({schedule}, () => {})

    expect(handler.schedule).toEqual(schedule)
    expect(handler.timezone).toBeUndefined()
    expectTypeOf(handler.timezone).toEqualTypeOf<undefined>()
  })

  it('discards the implementation return value', async () => {
    const handler = scheduledHandler({schedule: '0 9 * * *'}, (() => 'ignored') as never)
    await expect(handler(args)).resolves.toBeUndefined()
  })

  it('propagates handler errors', async () => {
    const handler = scheduledHandler({schedule: '0 9 * * *'}, async () => {
      throw new Error('boom')
    })
    await expect(handler(args)).rejects.toThrow('boom')
  })

  it.each([
    ['an empty schedule', {schedule: ' '}],
    ['a missing schedule', {}],
    ['incomplete cron fields', {schedule: {minute: '0', hour: '9'}}],
  ])('rejects %s', (_, options) => {
    expect(() => scheduledHandler(options as never, () => {})).toThrow('A schedule is required.')
  })

  it('rejects a non-string timezone', () => {
    expect(() => scheduledHandler({schedule: '0 9 * * *', timezone: 1 as never}, () => {})).toThrow(
      'The timezone must be an IANA timezone name',
    )
  })

  it('rejects a missing handler', () => {
    expect(() => scheduledHandler({schedule: '0 9 * * *'}, undefined as never)).toThrow(
      'A function handler is required.',
    )
  })
})
