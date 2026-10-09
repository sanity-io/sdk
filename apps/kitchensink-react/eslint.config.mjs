// @ts-check
import baseESLintConfig from '@repo/config-eslint'
import reactConfig from '@repo/config-eslint/react'

export default [
  {
    ignores: [
      // Ignore files for Sanity TypeGen, one per dataset
      'sanity.types*.ts',

      // Ignore generated .sanity directory
      '**/.sanity/**',
    ],
  },
  ...baseESLintConfig,
  ...reactConfig,
  {
    // Sanity config files import the `sanity` package and Vite, which are
    // build-time devDependencies for this App SDK app.
    files: ['sanity.config.ts', 'sanity.cli.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': [
        'error',
        {devDependencies: true, optionalDependencies: false, includeTypes: false},
      ],
    },
  },
]
