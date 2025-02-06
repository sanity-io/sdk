import {getEnv} from '../utils/getEnv'
import {type PreviewValue, type ValuePending} from './previewStore'

export const PREVIEW_TAG = 'sdk.preview'
export const STABLE_EMPTY_PREVIEW: ValuePending<PreviewValue> = {results: null, isPending: false}
export const STABLE_ERROR_PREVIEW: ValuePending<PreviewValue> = {
  results: {
    title: 'Preview Error',
    ...(!!getEnv('DEV') && {subtitle: 'Check the console for more details'}),
  },
  isPending: false,
}

export function hashString(str: string): string {
  // Using a large prime number for the hash
  const PRIME = 31
  // Using a max 32-bit integer to prevent overflow
  const MOD = 2147483647

  let hash = 0

  // Process chunks of the string to reduce complexity
  for (let i = 0; i < str.length; i++) {
    // Rolling hash computation
    hash = (hash * PRIME + str.charCodeAt(i)) % MOD
  }

  // Ensure we return a positive hash
  return Math.abs(hash).toString(16).padStart(8, '0')
}
