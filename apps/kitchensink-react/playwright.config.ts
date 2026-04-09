import {createPlaywrightConfig} from '@repo/e2e'

const isWebkitProject =
  process.argv.includes('--project=webkit') || process.argv.some((arg) => arg.includes('webkit'))

export default createPlaywrightConfig({
  testDir: './e2e',
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
            // Webkit runs standalone (no dashboard), so media library must be
            // provided explicitly rather than inferred from the org.
            ...(isWebkitProject
              ? {VITE_E2E_MEDIA_LIBRARY_ID: process.env['SDK_E2E_MEDIA_LIBRARY_ID'] || ''}
              : {}),
          },
        },
      }),
})
