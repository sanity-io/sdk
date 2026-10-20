import baseConfig from '@repo/config-oxlint'

// Only lints root files
export default {
  extends: [baseConfig],
  ignorePatterns: [
    // Packages and apps lint themselves; the base config covers the rest.
    'packages/',
    'apps/',
    '**/.turbo',
    'sanity.types.ts',
  ],
  overrides: [
    {
      // Root-level scripts are repo tooling and may import devDependencies.
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
