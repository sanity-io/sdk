import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import {googleMapsInput} from '@sanity/google-maps-input'

const API_KEY = 'AIzaSyDNp9K1o6TUEWsdZJdN9w6cJzPta-jIDhg'

export default defineConfig({
  name: 'default',
  title: 'Property Intents Demo',

  projectId: '9wmez61s',
  dataset: 'production',
  apiHost: 'https://api.sanity.work',

  plugins: [structureTool(), visionTool(), googleMapsInput({apiKey: API_KEY})],

  schema: {
    types: schemaTypes,
  },
})
