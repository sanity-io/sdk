// @ts-check
import {dirname, resolve} from 'node:path'

import {devAliases} from './dev-aliases.mjs'

const PACKAGES_PATH = resolve(getDirname(import.meta.url), '..', '..')

function getDirname(importMetaUrl) {
  return dirname(importMetaUrl.replace('file://', ''))
}

export function getVitestAliases() {
  return Object.fromEntries(
    Object.entries(devAliases).map(([packageName, aliasPath]) => [
      packageName,
      resolve(PACKAGES_PATH, aliasPath),
    ]),
  )
}
