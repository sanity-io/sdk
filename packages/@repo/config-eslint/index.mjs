// @ts-check

import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {FlatCompat} from '@eslint/eslintrc'
import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tsLint from 'typescript-eslint'

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
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
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
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
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
