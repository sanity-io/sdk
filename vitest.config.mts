import {defineConfig} from '@repo/config-test/vitest'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.{test,spec,stories,d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'packages/core/src/_exports/*.ts',
        'packages/react/src/_exports/*.ts',
        '**/*/_synchronous-groq-js.mjs',
        '**/getEnv.ts',
      ],
      thresholds: {
        // We should adjust these thresholds as we see what a reasonable coverage is
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 90,
      },
    },
  },
})
