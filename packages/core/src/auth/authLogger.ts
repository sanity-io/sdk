import {type SanityInstance} from '../store/createSanityInstance'
import {createLogger, type Logger} from '../utils/logger'

const loggers = new WeakMap<SanityInstance, Logger>()

/**
 * Returns the auth logger for a Sanity instance, creating it on first use.
 *
 * The logger is cached per instance so repeated action calls (logout,
 * setAuthToken, handleAuthCallback) reuse the same logger instead of
 * rebuilding it. The instance details are nested under `instanceContext`,
 * which is what the logger's formatter reads to render the
 * `[project:x] [dataset:y] [instance:z]` prefix.
 *
 * @internal
 */
export function getAuthLogger(instance: SanityInstance): Logger {
  let logger = loggers.get(instance)
  if (!logger) {
    logger = createLogger('auth', {
      instanceContext: {
        instanceId: instance.instanceId,
        projectId: instance.config.projectId,
        dataset: instance.config.dataset,
      },
    })
    loggers.set(instance, logger)
  }
  return logger
}
