import 'vitest'

import {type TestingLibraryMatchers} from '@testing-library/jest-dom/matchers'
/* eslint-disable @typescript-eslint/no-empty-object-type */

declare module 'vitest' {
  interface Assertion<
    R extends void | Promise<void> = void,
    T = unknown,
  > extends TestingLibraryMatchers<T, R> {}

  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
}
