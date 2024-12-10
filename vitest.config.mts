import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.{test,spec,stories,d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'packages/core/src/_exports/index.ts',
        'packages/react/src/_exports/index.ts',
        'packages/react/src/_exports/hooks.ts',
        'packages/react/src/_exports/components.ts',
      ],
      thresholds: {
        // We should adjust these thresholds as we see what a reasonable coverage is
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
})
