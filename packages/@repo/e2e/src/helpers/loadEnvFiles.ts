import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import dotenv from 'dotenv'

/**
 * Load environment variables from .env files, mirroring the behavior of Vite.
 *
 * @returns Array of environment file paths loaded.
 */
export function loadEnvFiles(): string[] {
  const mode = process.env['NODE_ENV'] || 'development'
  const envFiles = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  const loaded: string[] = []

  // Get the directory path using import.meta.url
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  for (const file of envFiles) {
    const envFilePath = path.join(__dirname, '..', '..', '..', '..', file)
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
