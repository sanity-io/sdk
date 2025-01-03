// @ts-check
import baseESLintConfig from '@repo/config-eslint'
import tsdocConfig from '@repo/config-eslint/tsdoc'

export default [
  {
    ignores: [
      '.DS_Store',
      '**/node_modules',
      '**/build',
      '**/dist',
      '**/coverage',
      '**/public',
      '**/docs',
      '.env',
      '.env.*',
      '!.env.example',

      // Ignore files for PNPM, NPM and YARN
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
    ],
  },
  ...baseESLintConfig,
  ...tsdocConfig,
]
