import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.{test,spec,stories,d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'packages/core/src/index.ts',
        'packages/react/src/index.ts',
        'packages/react/src/components/index.ts',
        'packages/react/src/hooks/index.ts',
      ],
      thresholds: {
        // We should adjust these thresholds as we see what a reasonable coverage is
        lines: 99,
        functions: 99,
        branches: 99,
        statements: 99,
      },
    },
  },
})
