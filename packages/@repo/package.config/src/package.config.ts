import {defineConfig} from '@sanity/pkg-utils'

export const basePackageConfig = defineConfig({
  extract: {
    rules: {
      'ae-internal-missing-underscore': 'off',
    },
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
      {
        name: 'function',
        allowMultiple: false,
        syntaxKind: 'modifier',
      },
      {
        name: 'interface',
        syntaxKind: 'modifier',
        allowMultiple: false,
      },
      {
        name: 'inlineType',
        syntaxKind: 'block',
        allowMultiple: true,
      },
    ],
  },
})
