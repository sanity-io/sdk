// @ts-check
import reactPlugin from 'eslint-plugin-react'
import reactCompiler from 'eslint-plugin-react-compiler'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default [
  reactCompiler.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', {allowConstantExport: true}],
    },
  },
  {
    ...reactPlugin.configs.flat?.recommended,
    settings: {
      react: {
        // Pinned to an explicit version instead of 'detect'. eslint-plugin-react@7.37.5's
        // version detection calls the `context.getFilename()` API that ESLint 10 removed,
        // which throws at lint time. An explicit version skips detection entirely.
        version: '19.2',
      },
    },
  },
  reactPlugin.configs.flat?.['jsx-runtime'],
]
