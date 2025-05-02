export function readEnv<KnownEnvVar extends keyof NodeJS.ProcessEnv>(name: KnownEnvVar): string {
  const val = findEnv<KnownEnvVar>(name)
  if (val === undefined) {
    throw new Error(`Missing required environment variable "${name}"`)
  }
  return val
}

function findEnv<KnownEnvVar extends keyof NodeJS.ProcessEnv>(
  name: KnownEnvVar,
): string | undefined {
  return process.env[name]
}
