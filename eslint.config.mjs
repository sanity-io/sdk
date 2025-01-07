// Only lints root files
import baseESLintConfig from '@repo/config-eslint'

export default [
  {
    ignores: [
      '.DS_Store',
      '**/node_modules',
      '**/build',
      '**/dist',
      '**/coverage',
      '**/docs',
      '**/packages/',
      '**/apps',
      '**/.turbo',
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
]
