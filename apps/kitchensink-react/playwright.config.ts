import {createPlaywrightConfig} from '@repo/e2e'

export default createPlaywrightConfig({
  testDir: './e2e',
  /* Run your local dev server before starting the tests */
  webServer: {
    command: process.env['CI']
      ? 'pnpm build --mode e2e && pnpm preview --mode e2e --port 3333'
      : 'pnpm dev --mode e2e',
    reuseExistingServer: true,
    stdout: 'pipe',
  },
})
