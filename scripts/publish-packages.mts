/* eslint-disable no-console */
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {setTimeout as sleep} from 'node:timers/promises'

// Publishes the SDK packages one at a time, waiting for npm to serve each version
// before publishing the next. npm holds every new version for a malware scan before
// it becomes installable, typically a few minutes and sometimes 15 or more, and the
// hold ends per package in no particular order:
// https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/
// @sanity/sdk-react pins the exact @sanity/sdk version, so publishing both at once
// (as `changeset publish` does) leaves `@sanity/sdk-react@latest`, and anything that
// depends on it, uninstallable whenever react clears the scan first.
//
// Versions already installable from npm are skipped, so reruns only publish what is
// missing. Exits once every package is installable.
//
// Usage: `pnpm release:publish <dist-tag>`, after `pnpm build:packages`.

const BASE_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
// Dependencies first.
const PACKAGES = ['packages/core', 'packages/react']
const REGISTRY = 'https://registry.npmjs.org'
const POLL_INTERVAL_MS = 10_000
const TIMEOUT_MS = 20 * 60_000

const tag = process.argv[2]
if (!tag) {
  console.error('Usage: pnpm release:publish <dist-tag>')
  process.exit(1)
}

/**
 * Checks the abbreviated packument, the document npm and pnpm resolve installs against.
 * A version held for scanning is missing from it until the scan passes.
 */
async function isInstallable(name: string, version: string): Promise<boolean> {
  const response = await fetch(`${REGISTRY}/${name.replace('/', '%2f')}`, {
    headers: {'accept': 'application/vnd.npm.install-v1+json', 'cache-control': 'no-cache'},
  })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`Fetching ${name} from npm failed with HTTP ${response.status}`)
  const packument = (await response.json()) as {versions?: Record<string, unknown>}
  return packument.versions?.[version] !== undefined
}

/** Like `isInstallable`, but treats registry errors as "not yet" so a blip doesn't fail the wait. */
async function pollInstallable(name: string, version: string): Promise<boolean> {
  try {
    return await isInstallable(name, version)
  } catch (error) {
    console.warn(String(error))
    return false
  }
}

async function waitUntilInstallable(name: string, version: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  while (!(await pollInstallable(name, version))) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${TIMEOUT_MS / 60_000} minutes waiting for npm to serve ${name}@${version}. ` +
          'npm may be holding it for manual review; check the package on npmjs.com.',
      )
    }
    console.log(`Waiting for npm to serve ${name}@${version}...`)
    await sleep(POLL_INTERVAL_MS)
  }
  console.log(`${name}@${version} is installable`)
}

function publish(dir: string): void {
  // No --provenance: trusted publishing (OIDC) adds it automatically.
  const result = spawnSync(
    'pnpm',
    ['publish', '--access', 'public', '--tag', tag, '--no-git-checks'],
    {cwd: path.join(BASE_PATH, dir), encoding: 'utf8'},
  )
  if (result.error) throw result.error
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  if (result.status === 0) return
  // The registry already has the version but is still holding it for scanning,
  // e.g. on a rerun after an earlier run timed out waiting.
  if (`${result.stdout}${result.stderr}`.includes('cannot publish over the previously published')) {
    console.log('npm already has this version; waiting for it to become installable')
    return
  }
  throw new Error(`pnpm publish failed in ${dir}`)
}

for (const dir of PACKAGES) {
  const {name, version} = JSON.parse(
    readFileSync(path.join(BASE_PATH, dir, 'package.json'), 'utf8'),
  ) as {name: string; version: string}
  if (await isInstallable(name, version)) {
    console.log(`${name}@${version} is already on npm, skipping`)
    continue
  }
  console.log(`Publishing ${name}@${version} under the ${tag} tag`)
  publish(dir)
  await waitUntilInstallable(name, version)
}
