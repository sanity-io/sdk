import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  deployment: {
    autoUpdates: false,
    appId: 'wffhl4eqd798s8bo71afoy6z',
  },
  app: {
    organizationId: 'oF5P8QpKU',
    entry: './src/App.tsx',
  },
})
