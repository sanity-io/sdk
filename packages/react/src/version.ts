import {version} from '../package.json'

/**
 * This version is provided by pkg-utils at build time
 * @internal
 */
export const REACT_SDK_VERSION = process.env['PKG_VERSION'] || `${version}-development`
