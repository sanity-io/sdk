import {basePlaywrightConfig, createPlaywrightConfig} from '@repo/e2e'

const baseURL = `https://www.sanity.work/@${process.env['SANITY_APP_E2E_ORGANIZATION_ID']}/application/${process.env['SANITY_APP_E2E_AUTO_UPDATES_APP_ID']}/`

export default createPlaywrightConfig({
  testDir: './e2e',
  projects: basePlaywrightConfig.projects
    // webkit and setup-standalone run a local build on localhost:3333; this app runs deployed in the Dashboard
    ?.filter((project) => project.name !== 'webkit' && project.name !== 'setup-standalone')
    .map((project) =>
      project.name === 'setup'
        ? {...project, testMatch: /auth\.setup\.ts$/}
        : {...project, use: {...project.use, baseURL}},
    ),
})
