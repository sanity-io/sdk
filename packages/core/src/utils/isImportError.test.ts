import {describe, expect, test} from 'vitest'

import {isImportError} from './isImportError'

describe('isImportError', () => {
  test('returns false for non-Error values', () => {
    expect(isImportError(null)).toBe(false)
    expect(isImportError(undefined)).toBe(false)
    expect(isImportError('Loading chunk 5 failed.')).toBe(false)
    expect(isImportError({message: 'Loading chunk 5 failed.'})).toBe(false)
    expect(isImportError(42)).toBe(false)
  })

  test('returns false for unrelated Error instances', () => {
    expect(isImportError(new Error('Something else went wrong'))).toBe(false)
    expect(isImportError(new TypeError('Cannot read properties of undefined'))).toBe(false)
  })

  test('detects webpack ChunkLoadError by name', () => {
    const err = new Error('arbitrary message')
    err.name = 'ChunkLoadError'
    expect(isImportError(err)).toBe(true)
  })

  test('detects webpack numeric chunk failure messages', () => {
    expect(isImportError(new Error('Loading chunk 5 failed.'))).toBe(true)
    expect(
      isImportError(new Error('Loading chunk 42 failed. (missing: https://x.com/42.abc.js)')),
    ).toBe(true)
  })

  test('detects webpack named chunk failure messages', () => {
    expect(isImportError(new Error('Loading chunk vendors-foo failed.'))).toBe(true)
    expect(isImportError(new Error('Loading chunk react_vendors failed.'))).toBe(true)
  })

  test('detects Vite "Failed to fetch dynamically imported module"', () => {
    expect(
      isImportError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://example.com/assets/Home-abc123.js',
        ),
      ),
    ).toBe(true)
  })

  test('detects Firefox "error loading dynamically imported module"', () => {
    expect(
      isImportError(
        new TypeError(
          'error loading dynamically imported module: http://localhost:8080/src/views/Dashboard/index.vue',
        ),
      ),
    ).toBe(true)
  })

  test('detects Safari module-script failures with and without the "ing" suffix', () => {
    expect(isImportError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isImportError(new TypeError('Import a module script failed.'))).toBe(true)
  })

  test('detects Vite CSS preload failures', () => {
    expect(isImportError(new Error('Unable to preload CSS for /assets/App-BBLnt7oG.css'))).toBe(
      true,
    )
  })

  test('matches case-insensitively', () => {
    expect(isImportError(new Error('loading chunk 1 FAILED'))).toBe(true)
    expect(isImportError(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE'))).toBe(true)
  })
})
