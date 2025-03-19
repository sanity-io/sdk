import {defineCliConfig} from 'sanity/cli'

if (!process.env['SANITY_ORG_ID']) {
  throw new Error('SANITY_ORG_ID is not set')
}

export default defineCliConfig({
  __experimental_appConfiguration: {
    appLocation: './src/App.tsx',
    organizationId: process.env['SANITY_ORG_ID'],
  },
})
