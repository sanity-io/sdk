import baseConfig from '@repo/config-oxlint'
import reactConfig from '@repo/config-oxlint/react'

export default {
  extends: [baseConfig, reactConfig],
  ignorePatterns: ['**/.sanity/**'],
  overrides: [
    {
      files: ['sanity.cli.ts'],
      rules: {
        'import-x-js/no-extraneous-dependencies': [
          'error',
          {devDependencies: true, optionalDependencies: false, includeTypes: false},
        ],
      },
    },
  ],
}
