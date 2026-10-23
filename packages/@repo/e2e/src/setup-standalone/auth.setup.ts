import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {test as setup} from '@playwright/test'

import {authenticateUser} from '../helpers/authenticateUser'

const AUTH_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.auth',
  'standalone.json',
)

setup('setup standalone authentication', async ({browser}) => {
  const context = await browser.newContext()

  try {
    await authenticateUser(context, {
      origin: 'http://localhost:3333',
      expectedRedirectUrl: 'http://localhost:3333',
    })
    await context.storageState({path: AUTH_FILE})
  } finally {
    await context.close()
  }
})
