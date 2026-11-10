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
}
