import {type GenericContext, type ScheduledFunctionContext} from '@sanity/functions'

/** Arguments supplied to an app's PubSub function handler. @beta */
export interface FunctionArgs<Input> {
  /** Sanity's function execution context. */
  context: GenericContext
  /** The invocation payload. */
  event: {data: Input}
}

/**
 * Define a callable app function while preserving its exact input and return types.
 * The CLI generates input and output validation when it builds the function.
 * @beta
 */
export function functionHandler<Handler extends (...args: never[]) => unknown>(
  handler: Handler,
): Handler {
  if (typeof handler !== 'function') throw new TypeError('A function handler is required.')
  return handler
}

/** Cron fields for a scheduled app function. @beta */
export interface FunctionScheduleFields {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

/**
 * When a scheduled app function runs: a cron expression such as `'0 9 * * *'`,
 * a natural language schedule such as `'weekdays at 8am'`, or explicit cron fields.
 * @beta
 */
export type FunctionSchedule = string | FunctionScheduleFields

/** Arguments supplied to a scheduled app function handler. @beta */
export interface ScheduledFunctionArgs {
  /** Sanity's function execution context. */
  context: ScheduledFunctionContext
}

/** Options for a scheduled app function. @beta */
export interface ScheduledFunctionOptions<
  Schedule extends FunctionSchedule = FunctionSchedule,
  Timezone extends string | undefined = string | undefined,
> {
  /**
   * When the function runs. The CLI reads this value from source without running it,
   * so it must be a literal, not computed or read from the environment.
   */
  schedule: Schedule
  /** IANA timezone for the schedule, such as `'Europe/Oslo'`. Defaults to UTC. */
  timezone?: Timezone
}

/**
 * A scheduled app function handler. It carries its schedule so the CLI can deploy it,
 * and is not callable from the app.
 * @beta
 */
export type ScheduledHandler<
  Schedule extends FunctionSchedule = FunctionSchedule,
  Timezone extends string | undefined = string | undefined,
> = ((args: ScheduledFunctionArgs) => Promise<void>) & {
  readonly schedule: Schedule
  readonly timezone: Timezone
}

/**
 * Define an app function that runs on a schedule instead of being called from the app.
 * @example
 * ```ts
 * export const handler = scheduledHandler({schedule: 'every day at 9am'}, async ({context}) => {
 *   // ...
 * })
 * ```
 * @beta
 */
export function scheduledHandler<
  const Schedule extends FunctionSchedule,
  const Timezone extends string | undefined = undefined,
>(
  options: ScheduledFunctionOptions<Schedule, Timezone>,
  handler: (args: ScheduledFunctionArgs) => void | Promise<void>,
): ScheduledHandler<Schedule, Timezone> {
  if (typeof handler !== 'function') throw new TypeError('A function handler is required.')
  if (!isSchedule(options?.schedule)) {
    throw new TypeError(
      'A schedule is required. Use a cron expression, a natural language schedule, or cron fields.',
    )
  }
  if (options.timezone !== undefined && typeof options.timezone !== 'string') {
    throw new TypeError('The timezone must be an IANA timezone name, such as "Europe/Oslo".')
  }
  const scheduled = async (args: ScheduledFunctionArgs): Promise<void> => {
    await handler(args)
  }
  return Object.assign(scheduled, {
    schedule: options.schedule,
    timezone: options.timezone as Timezone,
  })
}

const scheduleFields = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const

function isSchedule(value: unknown): value is FunctionSchedule {
  if (typeof value === 'string') return value.trim().length > 0
  if (!value || typeof value !== 'object') return false
  return scheduleFields.every(
    (field) => typeof (value as Record<string, unknown>)[field] === 'string',
  )
}
