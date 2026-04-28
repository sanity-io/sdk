// @ts-check
import baseESLintConfig from '@repo/config-eslint'
import reactConfig from '@repo/config-eslint/react'

export default [
  {
    ignores: [
      '.DS_Store',
      '**/node_modules',
      '**/build',
      '**/dist',
      '.env',
      '.env.*',
      '!.env.example',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
    ],
  },
  ...baseESLintConfig,
  ...reactConfig,
]
