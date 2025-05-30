import {createPlaywrightConfig} from '@repo/e2e'

export default createPlaywrightConfig({
  testDir: './e2e',
  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
  },
})
