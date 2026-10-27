import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {test as teardown} from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const AUTH_DIR = path.join(path.dirname(__filename), '..', '..', '.auth')

teardown('cleanup auth files', async () => {
  await fs.rm(AUTH_DIR, {recursive: true, force: true})
})
