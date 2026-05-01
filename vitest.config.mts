import {defineConfig} from '@repo/config-test/vitest'

export default defineConfig({
  test: {
    projects: ['packages/core', 'packages/react'],
    coverage: {
      provider: 'v8',
      reporter: ['html', 'json', 'json-summary'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.{test,spec,stories,d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'packages/core/src/_exports/*.ts',
        'packages/react/src/_exports/*.ts',
        'packages/core/src/utils/getEnv.ts',
        'packages/react/src/utils/getEnv.ts',
        'packages/core/src/version.ts',
        'packages/react/src/version.ts',
        '**/*/_synchronous-groq-js.mjs',
      ],
      thresholds: {
        // Recalibrated for vitest 4's v8 coverage methodology, which counts
        // statements separately from lines, treats arrow functions as their
        // own functions, and is stricter about branch coverage than v3.
        lines: 94,
        functions: 94,
        statements: 93,
        branches: 86,
      },
    },
  },
})
