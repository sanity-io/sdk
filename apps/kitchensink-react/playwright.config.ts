import {createPlaywrightConfig} from '@repo/e2e'

export default createPlaywrightConfig({
  testDir: './e2e',
  ...(process.env['CI']
    ? {} // In CI, don't start a webServer since it's started manually
    : {
        webServer: {
          command: 'pnpm dev',
          reuseExistingServer: true,
          stdout: 'pipe',
          env: {
            SANITY_APP_E2E_MODE: 'true', // Flag to indicate to the app that it's running in e2e mode
            // Pass e2e organization ID to sanity dev
            SANITY_APP_E2E_ORGANIZATION_ID: process.env['SANITY_APP_E2E_ORGANIZATION_ID'] || '',
          },
        },
      }),
})
