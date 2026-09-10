const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * Generates a random ID of the given length from the alphabet `[a-zA-Z0-9]`, the same shape
 * `@sanity/client` and Sanity Studio use for short IDs such as release IDs.
 *
 * Ported from `@sanity/client`'s `generateReleaseId`, which uses rejection sampling to keep
 * the output unbiased. Uses `crypto.getRandomValues`, which unlike `crypto.randomUUID` is
 * also available on insecure origins (plain http).
 *
 * @internal
 */
export function randomId(length: number = 8): string {
  let id = ''
  while (id.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length - id.length))
    for (const byte of bytes) {
      const index = byte & 63
      if (index < ID_ALPHABET.length) id += ID_ALPHABET.charAt(index)
    }
  }
  return id
}

/**
 * Generates a random v4 UUID.
 *
 * Prefers the native `crypto.randomUUID`, which is only available in secure contexts
 * (https, localhost). Falls back to deriving the UUID from `crypto.getRandomValues`,
 * which has no such restriction, so ID generation also works when an app is served over
 * plain http, e.g. when testing from a phone on a local network.
 *
 * @internal
 */
export function randomUuid(): string {
  // eslint-disable-next-line no-restricted-properties -- this is the sanctioned wrapper around crypto.randomUUID
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (byte, index) => {
    // Set the version (4) and variant (RFC 4122) bits
    if (index === 6) byte = (byte & 0x0f) | 0x40
    if (index === 8) byte = (byte & 0x3f) | 0x80
    return byte.toString(16).padStart(2, '0')
  }).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
