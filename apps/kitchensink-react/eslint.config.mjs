// @ts-check
import baseESLintConfig from '@repo/config-eslint'
import reactConfig from '@repo/config-eslint/react'

export default [
  {
    ignores: [
      // Ignore files for Sanity TypeGen
      'sanity.types.ts',

      // Ignore generated .sanity directory
      '**/.sanity/**',
    ],
  },
  ...baseESLintConfig,
  ...reactConfig,
  {
    // Node tooling scripts (e.g. typegen) legitimately use console output.
    files: ['scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Tooling scripts and Sanity config files import the `sanity` package and
    // Vite, which are build-time devDependencies for this App SDK app.
    files: ['scripts/**', 'sanity.config.ts', 'sanity.cli.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': [
        'error',
        {devDependencies: true, optionalDependencies: false, includeTypes: false},
      ],
    },
  },
]
