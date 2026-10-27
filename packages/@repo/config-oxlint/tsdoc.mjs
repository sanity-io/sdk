// @ts-check
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)

/** @type {import('oxlint').OxlintConfig} */
export default {
  jsPlugins: [require.resolve('eslint-plugin-tsdoc')],
  rules: {
    'tsdoc/syntax': 'error',
  },
}
