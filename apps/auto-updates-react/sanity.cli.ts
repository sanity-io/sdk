import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    organizationId: process.env['SANITY_APP_E2E_ORGANIZATION_ID'],
    entry: './src/App.tsx',
  },
  deployment: {
    autoUpdates: true,
  },
})
