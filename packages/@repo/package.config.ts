import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  extract: {
    customTags: [
      {
        name: 'module',
        allowMultiple: true,
        syntaxKind: 'block',
      },
      {
        name: 'category',
        allowMultiple: true,
        syntaxKind: 'block',
      },
    ],
  },
})
