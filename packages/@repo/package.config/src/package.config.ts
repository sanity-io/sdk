import {defineConfig} from '@sanity/pkg-utils'

export const basePackageConfig = defineConfig({
  extract: {
    customTags: [
      {
        name: 'thoughtLevel',
        allowMultiple: true,
        syntaxKind: 'block',
      },
      {
        name: 'todo',
        allowMultiple: true,
        syntaxKind: 'block',
      },
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
