// @ts-check

import js from '@eslint/js'
import tsLint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import globals from 'globals'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import {FlatCompat} from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tsLint.configs.recommended,
  ...compat.extends('eslint-config-turbo'),
  {
    rules: {
      'simple-import-sort/exports': 'warn',
      'simple-import-sort/imports': 'warn',
      'no-console': 'error',
      'no-shadow': 'error',
      'no-warning-comments': [
        'warn',
        {
          location: 'start',
          terms: ['todo', 'fixme'],
        },
      ],
      'quote-props': ['warn', 'consistent-as-needed'],
      'strict': ['warn', 'global'],
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2017,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/member-delimiter-style': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
]
