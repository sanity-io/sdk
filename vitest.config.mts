import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.{test,spec,stories,d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    },
  },
})
