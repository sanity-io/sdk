import baseESLintConfig from '@repo/config-eslint'
import reactConfig from '@repo/config-eslint/react'
import storybookConfig from 'eslint-plugin-storybook'

export default [
  {
    ignores: ['dist', 'storybook-static'],
  },
  ...baseESLintConfig,
  ...reactConfig,
  {
    files: ['**/*.@(js|jsx|mjs|ts|tsx)'],
    rules: {
      'react/display-name': 'off',
    },
  },
  ...storybookConfig.configs['flat/recommended'],
]
