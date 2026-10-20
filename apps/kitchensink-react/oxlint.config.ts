import baseConfig from '@repo/config-oxlint'
import reactConfig from '@repo/config-oxlint/react'

export default {
  extends: [baseConfig, reactConfig],
  ignorePatterns: [
    // Ignore files for Sanity TypeGen, one per dataset
    'sanity.types*.ts',

    // Ignore generated .sanity directory
    '**/.sanity/**',
  ],
  overrides: [
    {
      // Sanity config files import the `sanity` package and Vite, which are
      // build-time devDependencies for this App SDK app.
      files: ['sanity.config.ts', 'sanity.cli.ts'],
      rules: {
        'import-x-js/no-extraneous-dependencies': [
          'error',
          {devDependencies: true, optionalDependencies: false, includeTypes: false},
        ],
      },
    },
  ],
}
