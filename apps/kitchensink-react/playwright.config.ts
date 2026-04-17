import {createPlaywrightConfig} from '@repo/e2e'

// const isWebkitProject =
//   process.argv.includes('--project=webkit') || process.argv.some((arg) => arg.includes('webkit'))

export default createPlaywrightConfig({
  testDir: './e2e',
  ...(process.env['CI']
    ? {} // In CI, don't start a webServer since it's started manually
    : {
        webServer: {
          // Restore for Dashboard when we get secrets
          // command: isWebkitProject ? 'pnpm exec vite --port 3333' : 'pnpm dev',
          command: 'pnpm exec vite --port 3333',
          reuseExistingServer: true,
          stdout: 'pipe',
          env: {
            // Pass e2e organization ID to sanity dev
            SDK_E2E_ORGANIZATION_ID: process.env['SDK_E2E_ORGANIZATION_ID'] || '',
          },
        },
      }),
})
