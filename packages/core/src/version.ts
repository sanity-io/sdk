import {version} from '../package.json'
import {getEnv} from './utils/getEnv'

/**
 * This version is provided by pkg-utils at build time
 * @internal
 */
export const CORE_SDK_VERSION = getEnv('PKG_VERSION') || `${version}-development`
