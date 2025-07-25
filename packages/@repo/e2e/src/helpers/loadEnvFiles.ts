import fs from 'node:fs'
import path from 'node:path'

import dotenv from 'dotenv'

/**
 * Find the monorepo root directory by looking for the root package.json
 */
function findMonorepoRoot(): string {
  let currentDir = process.cwd()
  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(currentDir, 'package.json'), 'utf-8'))
      if (pkg.name === 'sdk-root') {
        return currentDir
      }
    }
    currentDir = path.dirname(currentDir)
  }
  throw new Error('Could not find monorepo root directory')
}

/**
 * Load environment variables from .env files, mirroring the behavior of Vite.
 *
 * @returns Array of environment file paths loaded.
 */
export function loadEnvFiles(): string[] {
  const mode = process.env['NODE_ENV'] || 'development'
  const envFiles = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  const loaded: string[] = []

  // Load from monorepo root directory
  const rootDir = findMonorepoRoot()
  for (const file of envFiles) {
    const envFilePath = path.join(rootDir, file)
    if (!fs.existsSync(envFilePath)) {
      continue
    }
    const {error} = dotenv.config({path: envFilePath})
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to load environment variables from ${envFilePath}: ${error.message}`)
    }

    loaded.push(envFilePath)
  }

  return loaded
}
