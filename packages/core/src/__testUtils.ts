/**
 * @todo Where should these test utils live?
 */
import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join as joinPath} from 'node:path'

import {createSanityInstance} from './instance/sanityInstance'
import type {SanityInstance} from './instance/types'

let token: string | null = null

/**
 * Creates a new Sanity instance configured to a test project.
 * Authentication token used is either `SANITY_TEST_AUTH_TOKEN`, _or_
 * the current users' CLI token if `SANITY_TEST_AUTH_TOKEN` is not set.
 *
 * Note: Recreated on every call by design.
 * @returns A new Sanity instance.
 */
export async function getTestInstance(): Promise<SanityInstance> {
  token ||= await getTestToken()
  return createSanityInstance({
    projectId: 'ppsg7ml5',
    dataset: 'test',
    token,
  })
}

async function getTestToken() {
  return process.env['SANITY_TEST_AUTH_TOKEN'] || getCliAuthToken()
}

async function getCliAuthToken() {
  const cfgPath = joinPath(homedir(), '.config', 'sanity', 'config.json')
  let cfg
  try {
    cfg = JSON.parse(await readFile(cfgPath, 'utf8'))
  } catch (err) {
    throw new Error(`No CLI config found at ${cfgPath}`)
  }

  if (!cfg || !('authToken' in cfg)) {
    throw new Error(`No CLI auth token found in ${cfgPath}`)
  }

  const authToken = cfg.authToken
  if (typeof authToken !== 'string') {
    throw new Error(`Invalid CLI auth token found in ${cfgPath}`)
  }

  return authToken.trim()
}
