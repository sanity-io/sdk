import {createPlaywrightConfig} from '@repo/e2e'

const isWebkitProject =
  process.argv.includes('--project=webkit') || process.argv.some((arg) => arg.includes('webkit'))

export default createPlaywrightConfig({
  testDir: './e2e',
  /* Run your local dev server before starting the tests */
  ...(process.env['CI']
    ? {} // In CI, don't start a webServer since it's started manually
    : {
        webServer: {
          command: isWebkitProject ? 'pnpm exec vite --port 3333' : 'pnpm dev',
          reuseExistingServer: true,
          stdout: 'pipe',
          env: {
            // Pass e2e organization ID to sanity dev
            SDK_E2E_ORGANIZATION_ID: process.env['SDK_E2E_ORGANIZATION_ID'] || '',
          },
        },
      }),
})
