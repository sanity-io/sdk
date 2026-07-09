// Only lints root files
import baseESLintConfig from '@repo/config-eslint'

export default [
  {
    ignores: [
      // Packages and apps lint themselves; the base config covers the rest.
      '**/packages/',
      '**/apps',
      '**/.turbo',
      'sanity.types.ts',
    ],
  },
  ...baseESLintConfig,
  {
    // Root-level scripts are repo tooling and may import devDependencies.
    files: ['scripts/**'],
    rules: {
      'import-x/no-extraneous-dependencies': [
        'error',
        {devDependencies: true, optionalDependencies: false, includeTypes: false},
      ],
    },
  },
]
