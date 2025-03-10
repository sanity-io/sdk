// Local type declaration for Remix
type WindowWithEnv = Window &
  typeof globalThis & {
    ENV?: Record<string, unknown>
  }

type KnownEnvVar = 'DEV' | 'PKG_VERSION'

export function getEnv(key: KnownEnvVar): unknown {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // Vite environment variables
    return (import.meta.env as unknown as Record<string, unknown>)[key]
  } else if (typeof process !== 'undefined' && process.env) {
    // Node.js or server-side environment variables
    return process.env[key]
  } else if (typeof window !== 'undefined' && (window as WindowWithEnv).ENV) {
    // Remix-style client-side environment variables
    return (window as WindowWithEnv).ENV?.[key]
  }
  return undefined
}
