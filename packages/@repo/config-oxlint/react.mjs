// @ts-check
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)

/** @type {import('oxlint').OxlintConfig} */
export default {
  plugins: ['react'],
  jsPlugins: [require.resolve('eslint-plugin-react-compiler')],
  settings: {react: {version: '19.2'}},
  rules: {
    'react-compiler/react-compiler': 'error',
    // `eslint-plugin-react` recommended
    'react/display-name': 'error',
    'react/jsx-key': 'error',
    'react/jsx-no-comment-textnodes': 'error',
    'react/jsx-no-duplicate-props': 'error',
    'react/jsx-no-target-blank': 'error',
    'react/jsx-no-undef': 'error',
    'react/no-children-prop': 'error',
    'react/no-danger-with-children': 'error',
    'react/no-direct-mutation-state': 'error',
    'react/no-find-dom-node': 'error',
    'react/no-is-mounted': 'error',
    'react/no-render-return-value': 'error',
    'react/no-string-refs': 'error',
    'react/no-unescaped-entities': 'error',
    'react/no-unknown-property': 'error',
  },
  overrides: [
    {
      files: ['**/*.{ts,tsx}'],
      env: {es2020: true},
      rules: {
        // `eslint-plugin-react-hooks` recommended
        'react/error-boundaries': 'error',
        'react/exhaustive-deps': 'error',
        'react/globals': 'error',
        'react/immutability': 'error',
        'react/incompatible-library': 'warn',
        'react/preserve-manual-memoization': 'error',
        'react/purity': 'error',
        'react/refs': 'error',
        'react/rules-of-hooks': 'error',
        'react/set-state-in-effect': 'error',
        'react/set-state-in-render': 'error',
        'react/static-components': 'error',
        'react/unsupported-syntax': 'warn',
        'react/use-memo': 'error',
        'react/only-export-components': ['warn', {allowConstantExport: true}],
      },
    },
  ],
}
