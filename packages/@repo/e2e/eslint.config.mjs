import baseConfig from '@repo/config-eslint'

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {},
  },
]
