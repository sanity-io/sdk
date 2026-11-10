import baseConfig from '@repo/config-oxlint'
import tsdocConfig from '@repo/config-oxlint/tsdoc'

export default {
  extends: [baseConfig, tsdocConfig],
  ignorePatterns: ['src/preferences/registry.generated.ts'],
  overrides: [
    {
      files: ['scripts/**'],
      rules: {
        'import-x-js/no-extraneous-dependencies': [
          'error',
          {devDependencies: true, optionalDependencies: false, includeTypes: false},
        ],
      },
    },
  ],
}
