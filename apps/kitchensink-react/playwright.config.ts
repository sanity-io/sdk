import {createPlaywrightConfig} from '@repo/e2e'

export default createPlaywrightConfig({
  testDir: './e2e',
  /* Run your local dev server before starting the tests */
  ...(process.env['CI']
    ? {} // In CI, don't start a webServer since it's started manually
    : {
        webServer: {
          command: 'pnpm dev --mode e2e',
          reuseExistingServer: true,
          stdout: 'pipe',
        },
      }),
})
