/**
 * Marks errors that leave SDK code, so the reporter can tell them apart from app errors when
 * the SDK is bundled into the app and stack frame URLs no longer name the SDK. `Symbol.for`
 * keeps the mark readable across two copies of the SDK on one page.
 */
const SDK_ORIGIN = Symbol.for('@sanity/sdk/errorOrigin')

/**
 * Marks an error as thrown by SDK code. Errors already marked, and values that are not
 * `Error` instances, are left alone.
 *
 * @internal
 */
export function markSdkError(error: unknown): void {
  if (!(error instanceof Error) || Object.hasOwn(error, SDK_ORIGIN)) return
  try {
    Object.defineProperty(error, SDK_ORIGIN, {value: true})
  } catch {
    // A frozen error stays unmarked
  }
}

/**
 * Whether an error was marked by {@link markSdkError}.
 *
 * @internal
 */
export function isSdkError(error: unknown): boolean {
  return error instanceof Error && Object.hasOwn(error, SDK_ORIGIN)
}

const MAX_CAUSE_DEPTH = 5

/**
 * The first error marked by {@link markSdkError} in an error and its `cause` chain. An app that
 * catches an SDK error and throws its own error with the SDK error as `cause` still has an SDK
 * bug at the root.
 *
 * @internal
 */
export function findSdkErrorInChain(error: unknown): Error | undefined {
  let current = error
  try {
    for (let depth = 0; depth < MAX_CAUSE_DEPTH && current instanceof Error; depth++) {
      if (isSdkError(current)) return current
      current = current.cause
    }
  } catch {
    // A throwing `cause` getter ends the walk
  }
  return undefined
}
