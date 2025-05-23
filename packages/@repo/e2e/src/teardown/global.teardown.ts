import {test as teardown} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const AUTH_FILE = path.join(path.dirname(__filename), '..', '..', '.auth', 'user.json')

teardown('cleanup auth file', async () => {
  try {
    await fs.rm(AUTH_FILE)
  } catch (error) {
    // Ignore error if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
})
