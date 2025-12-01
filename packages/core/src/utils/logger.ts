/**
 * Logging infrastructure for the Sanity SDK
 *
 * Provides multi-level, namespace-based logging for both SDK users and maintainers.
 * In production builds, all logging can be stripped via tree-shaking.
 *
 * @example SDK User
 * ```ts
 * import {configureLogging} from '@sanity/sdk'
 *
 * configureLogging({
 *   level: 'info',
 *   namespaces: ['auth', 'document']
 * })
 * ```
 *
 * @example SDK Maintainer
 * ```ts
 * configureLogging({
 *   level: 'trace',
 *   namespaces: ['*'],
 *   internal: true
 * })
 * ```
 */

/**
 * Log levels in order of verbosity (least to most)
 * - error: Critical failures that prevent operation
 * - warn: Issues that may cause problems but don't stop execution
 * - info: High-level informational messages (SDK user level)
 * - debug: Detailed debugging information (maintainer level)
 * - trace: Very detailed tracing (maintainer level, includes RxJS streams)
 * @public
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'

/**
 * Log namespaces organize logs by functional domain
 *
 * @remarks
 * This is an extensible string type. As logging is added to more modules,
 * additional namespaces will be recognized. Currently implemented namespaces
 * will be documented as they are added.
 * @internal
 */
export type LogNamespace = string

/**
 * Configuration for the logging system
 * @public
 */
export interface LoggerConfig {
  /**
   * Minimum log level to output
   * @defaultValue 'warn'
   */
  level?: LogLevel

  /**
   * Namespaces to enable. Use ['*'] for all namespaces
   * @defaultValue []
   * @remarks
   * Available namespaces depend on which modules have logging integrated.
   * Check the SDK documentation for the current list of instrumented modules.
   * @example ['auth', 'document']
   */
  namespaces?: string[]

  /**
   * Enable internal/maintainer-level logging
   * Shows RxJS streams, store internals, etc.
   * @defaultValue false
   */
  internal?: boolean

  /**
   * Custom log handler (for testing or custom output)
   * @defaultValue console methods
   */
  handler?: LogHandler

  /**
   * Enable timestamps in log output
   * @defaultValue true
   */
  timestamps?: boolean

  /**
   * Enable in production builds
   * @defaultValue false
   */
  enableInProduction?: boolean
}

/**
 * Custom log handler interface
 *
 * @internal
 */
export interface LogHandler {
  error: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  info: (message: string, context?: LogContext) => void
  debug: (message: string, context?: LogContext) => void
  trace: (message: string, context?: LogContext) => void
}

/**
 * Context object attached to log messages
 * @internal
 */
export interface LogContext {
  [key: string]: unknown
  /** Error object if logging an error */
  error?: Error | unknown
  /** Duration in milliseconds for timed operations */
  duration?: number
  /** Stack trace for debugging */
  stack?: string
  /** Instance context (automatically added when available) */
  instanceContext?: InstanceContext
}

/**
 * Instance context information automatically added to logs
 * @internal
 */
export interface InstanceContext {
  /** Unique instance ID */
  instanceId?: string
  /** Project ID */
  projectId?: string
  /** Dataset name */
  dataset?: string
}

/**
 * Logger instance for a specific namespace
 * @internal
 */
export interface Logger {
  readonly namespace: string
  error: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  info: (message: string, context?: LogContext) => void
  debug: (message: string, context?: LogContext) => void
  trace: (message: string, context?: LogContext) => void
  /** Check if a log level is enabled (for performance-sensitive code) */
  isLevelEnabled: (level: LogLevel) => boolean
  /** Create a child logger with extended context */
  child: (context: LogContext) => Logger
  /** Get the instance context if available */
  getInstanceContext: () => InstanceContext | undefined
}

// Log level priority (lower number = higher priority)
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
}

// Global configuration
let globalConfig: Required<LoggerConfig> = {
  level: 'warn',
  namespaces: [],
  internal: false,
  timestamps: true,
  enableInProduction: false,
  handler: {
    // eslint-disable-next-line no-console
    error: console.error.bind(console),
    // eslint-disable-next-line no-console
    warn: console.warn.bind(console),
    // eslint-disable-next-line no-console
    info: console.info.bind(console),
    // eslint-disable-next-line no-console
    debug: console.debug.bind(console),
    // eslint-disable-next-line no-console
    trace: console.debug.bind(console), // trace uses console.debug
  },
}

/**
 * Configure the global logging system
 * @public
 */
export function configureLogging(config: LoggerConfig): void {
  globalConfig = {
    ...globalConfig,
    ...config,
    handler: config.handler ?? globalConfig.handler,
  }
}

/**
 * Get the current logging configuration
 * @internal
 */
export function getLoggingConfig(): Readonly<Required<LoggerConfig>> {
  return globalConfig
}

/**
 * Reset logging to default configuration
 * @internal
 */
export function resetLogging(): void {
  globalConfig = {
    level: 'warn',
    namespaces: [],
    internal: false,
    timestamps: true,
    enableInProduction: false,
    handler: {
      // eslint-disable-next-line no-console
      error: console.error.bind(console),
      // eslint-disable-next-line no-console
      warn: console.warn.bind(console),
      // eslint-disable-next-line no-console
      info: console.info.bind(console),
      // eslint-disable-next-line no-console
      debug: console.debug.bind(console),
      // eslint-disable-next-line no-console
      trace: console.debug.bind(console),
    },
  }
}

/**
 * Check if logging is enabled in the current environment
 * @internal
 */
function isLoggingEnabled(): boolean {
  // In production, only log if explicitly enabled
  if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'production') {
    return globalConfig.enableInProduction
  }
  return true
}

/**
 * Check if a namespace is enabled
 * @internal
 */
function isNamespaceEnabled(namespace: string): boolean {
  if (!isLoggingEnabled()) return false
  if (globalConfig.namespaces.includes('*')) return true
  return globalConfig.namespaces.includes(namespace)
}

/**
 * Check if a log level is enabled
 * @internal
 */
function isLevelEnabled(level: LogLevel): boolean {
  if (!isLoggingEnabled()) return false
  return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[globalConfig.level]
}

/**
 * Format a log message with timestamp, namespace, and instance context
 * @internal
 */
function formatMessage(
  namespace: LogNamespace,
  level: LogLevel,
  message: string,
  context?: LogContext,
): [string, LogContext | undefined] {
  const parts: string[] = []

  if (globalConfig.timestamps) {
    const timestamp = new Date().toISOString()
    parts.push(`[${timestamp}]`)
  }

  parts.push(`[${level.toUpperCase()}]`)
  parts.push(`[${namespace}]`)

  // Add instance context if available
  const instanceContext = context?.instanceContext
  if (instanceContext) {
    if (instanceContext.projectId) {
      parts.push(`[project:${instanceContext.projectId}]`)
    }
    if (instanceContext.dataset) {
      parts.push(`[dataset:${instanceContext.dataset}]`)
    }
    if (instanceContext.instanceId) {
      parts.push(`[instance:${instanceContext.instanceId.slice(0, 8)}]`)
    }
  }

  parts.push(message)

  return [parts.join(' '), context]
}

/**
 * Sanitize context for logging (remove sensitive data)
 * @internal
 */
function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context || Object.keys(context).length === 0) return undefined

  const sanitized = {...context}

  // Remove or redact sensitive fields
  const sensitiveKeys = ['token', 'password', 'secret', 'apiKey', 'authorization']
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]'
    }
  }

  return sanitized
}

/**
 * Create a logger for a specific namespace
 * @param namespace - A string identifier for the logging domain (e.g., 'auth', 'document')
 * @param baseContext - Optional base context to include in all log messages
 * @remarks
 * If baseContext includes an `instanceContext` property (with projectId, dataset, instanceId),
 * it will be automatically formatted into the log output for easier debugging of
 * multi-instance scenarios.
 * @public
 */
export function createLogger(namespace: string, baseContext?: LogContext): Logger {
  const logAtLevel = (level: LogLevel, message: string, context?: LogContext) => {
    // Early return if namespace or level not enabled
    if (!isNamespaceEnabled(namespace)) return
    if (!isLevelEnabled(level)) return

    // Skip internal logs if not enabled
    if (context?.['internal'] && !globalConfig.internal) return

    const mergedContext = {...baseContext, ...context}
    const sanitized = sanitizeContext(mergedContext)
    const [formatted, finalContext] = formatMessage(namespace, level, message, sanitized)

    globalConfig.handler[level](formatted, finalContext)
  }

  const logger: Logger = {
    namespace,
    error: (message, context) => logAtLevel('error', message, context),
    warn: (message, context) => logAtLevel('warn', message, context),
    info: (message, context) => logAtLevel('info', message, context),
    debug: (message, context) => logAtLevel('debug', message, context),
    trace: (message, context) => logAtLevel('trace', message, {...context, internal: true}),
    isLevelEnabled: (level) => isNamespaceEnabled(namespace) && isLevelEnabled(level),
    child: (childContext) => createLogger(namespace, {...baseContext, ...childContext}),
    getInstanceContext: () => baseContext?.instanceContext,
  }

  return logger
}

/**
 * Create a performance timer for measuring operation duration
 * @internal
 */
export function createTimer(
  namespace: string,
  operation: string,
): {end: (message?: string, context?: LogContext) => number} {
  const logger = createLogger(namespace)
  const start = performance.now()

  return {
    end: (message?: string, context?: LogContext): number => {
      const duration = performance.now() - start
      logger.debug(message ?? `${operation} completed`, {
        ...context,
        operation,
        duration,
      })
      return duration
    },
  }
}

/**
 * Utility to log RxJS operator execution (for maintainers)
 * Will be exported in future PR when logging is added to stores
 * @internal
 */
function logRxJSOperator(namespace: string, operator: string, context?: LogContext): void {
  const logger = createLogger(namespace)
  logger.trace(`RxJS: ${operator}`, {...context, internal: true, operator})
}

/**
 * Extract instance context from a SanityInstance for logging
 * Will be exported in future PR when logging is added to stores
 * @param instance - The SanityInstance to extract context from
 * @returns Instance context suitable for logging
 * @internal
 */
function getInstanceContext(instance: {
  instanceId?: string
  config?: {projectId?: string; dataset?: string}
}): InstanceContext {
  return {
    instanceId: instance.instanceId,
    projectId: instance.config?.projectId,
    dataset: instance.config?.dataset,
  }
}

// Prevent unused function warnings - these will be exported and used in future PRs
void logRxJSOperator
void getInstanceContext
