// @ts-check
import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import turboConfig from 'eslint-config-turbo/flat'
import {createTypeScriptImportResolver} from 'eslint-import-resolver-typescript'
import * as importPlugin from 'eslint-plugin-import'
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tsLint from 'typescript-eslint'

export default [
  {
    ignores: [
      '.DS_Store',
      '**/node_modules',
      '**/build',
      '**/dist',
      '**/lib',
      '**/coverage',
      '**/public',
      '**/docs',
      '.env',
      '.env.*',
      '!.env.example',

      // Ignore files for PNPM, NPM and YARN
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
    ],
  },
  js.configs.recommended,
  eslintConfigPrettier,
  importPlugin.flatConfigs?.typescript,
  eslintPluginPrettier,
  ...tsLint.configs.recommended,
  ...turboConfig,
  {
    rules: {
      'import/consistent-type-specifier-style': ['error', 'prefer-inline'],
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-cycle': 'error',
      'import/no-duplicates': [
        'error',
        {
          'prefer-inline': true,
        },
      ],
      'import/no-self-import': 'error',
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/*.test.ts',
            '**/*.test.tsx',
            '**/test/**',
            '**/e2e/**',
            '**/config-eslint/**',
            '**/vite.config.ts',
            '**/eslint.config.mjs',
            '**/vitest.mjs',
            '**/vitest.config.ts',
            '**/vitest.config.mts',
            '**/package.bundle.ts',
            '**/package.config.ts',
            '**/playwright.config.ts',
            '**/knip.config.ts',
          ],
          optionalDependencies: false,
          includeTypes: false,
        },
      ],
      'import/order': 'off',
      'no-console': 'error',
      'no-multi-spaces': 'error',
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
            {
              group: ['vitest/config'],
              message: 'Use `@repo/config-test/vitest` instead',
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
  {ignores: ['**/_synchronous-groq-js.mjs']},
]
