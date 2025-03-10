import {version} from '../package.json'
import {getEnv} from './utils/getEnv'

/**
 * This version is provided by pkg-utils at build time
 * @internal
 */
export const REACT_SDK_VERSION = getEnv('PKG_VERSION') || `${version}-development`
