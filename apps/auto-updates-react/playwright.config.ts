import {basePlaywrightConfig, createPlaywrightConfig} from '@repo/e2e'

const {SANITY_APP_E2E_ORGANIZATION_ID, SANITY_APP_E2E_AUTO_UPDATES_APP_ID} = process.env

if (!SANITY_APP_E2E_AUTO_UPDATES_APP_ID) {
  throw new Error('Missing SANITY_APP_E2E_AUTO_UPDATES_APP_ID, the id of the deployed app to test')
}

const baseURL = `https://www.sanity.work/@${SANITY_APP_E2E_ORGANIZATION_ID}/application/${SANITY_APP_E2E_AUTO_UPDATES_APP_ID}/`

export default createPlaywrightConfig({
  testDir: './e2e',
  projects: basePlaywrightConfig.projects
    ?.filter((project) => project.name !== 'webkit')
    .map((project) =>
      project.name === 'setup'
        ? {...project, testMatch: /auth\.setup\.ts$/}
        : {...project, use: {...project.use, baseURL}},
    ),
})
