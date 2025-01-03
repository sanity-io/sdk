// @ts-check
import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import turboConfig from 'eslint-config-turbo/flat'
import {createTypeScriptImportResolver} from 'eslint-import-resolver-typescript'
import * as importPlugin from 'eslint-plugin-import'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tsLint from 'typescript-eslint'

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  importPlugin.flatConfigs?.typescript,
  ...tsLint.configs.recommended,
  ...turboConfig,
  {
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/dist', '**/dist/*'],
              message: 'Do not import from `dist`',
            },
            {
              group: ['**/_exports', '**/_exports/*'],
              message: 'Do not import from `_exports`',
            },
          ],
        },
      ],
      'no-shadow': 'error',
      'no-unused-vars': 'off',
      'no-warning-comments': [
        'warn',
        {
          location: 'start',
          terms: ['todo', 'fixme'],
        },
      ],
      'quote-props': ['warn', 'consistent-as-needed'],
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
      'strict': ['warn', 'global'],
      'import/no-self-import': 'error',
      'import/no-cycle': 'error',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      'import': importPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2017,
        ...globals.node,
      },
    },
    settings: {
      'import/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          extensions: ['.js', '.ts', '.mjs', '.mts'],

          // use an array of glob patterns
          project: ['packages/*/tsconfig.json', 'apps/*/tsconfig.json'],
        }),
      ],
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
