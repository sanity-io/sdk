#!/usr/bin/env zx
import 'zx/globals'
/* eslint-disable @typescript-eslint/no-unused-expressions */

const isMajor = process.argv.includes('--major')
// Any extra CLI args (e.g. `--dry-run`, `--otp=123456`) are forwarded to
// `pnpm publish`. `--major` is consumed here, so it is not forwarded.
const publishArgs = process.argv.slice(2).filter((arg) => arg !== '--major')

const {packages} = await fs.readJson('./release-please-config.json')
const workspaces: string[] = Object.keys(packages)
const manifest: Record<string, string> = await fs.readJson('./.release-please-manifest.json')

// Collect the publishable (non-private) workspaces up front.
const publishable: {workspace: string; name: string; version: string}[] = []
for (const workspace of workspaces) {
  const {name, version, private: isPrivate} = await fs.readJson(`./${workspace}/package.json`)
  if (!isPrivate) publishable.push({workspace, name, version})
}

if (publishable.length === 0) throw new Error('no publishable workspaces found')

// Returns the highest of a list of `major.minor.patch` versions.
function maxStable(versions: string[]): string {
  return versions.reduce((max, v) => {
    const a = max.split('.').map(Number)
    const b = v.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      if (b[i] !== a[i]) return b[i] > a[i] ? v : max
    }
    return max
  })
}

// Looks up every version already published for a package. Returns an empty list
// when the package has never been published (npm exits non-zero).
async function publishedVersions(name: string): Promise<string[]> {
  try {
    // Pass args as an array so the interpolation is the final token — a trailing
    // bare word like `versions` here trips knip's binary detection (depcheck).
    const {stdout} = await $`npm view ${[name, 'versions', '--json']}`.quiet()
    const parsed = JSON.parse(stdout)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

const existing = (await Promise.all(publishable.map(({name}) => publishedVersions(name)))).flat()

// The base `major.minor.patch` we want to cut an rc for. Versions are linked
// across packages (see the `linked-versions` plugin in release-please-config.json),
// so we derive a single shared base from the highest stable version in the manifest…
const stableBase = maxStable(publishable.map(({workspace}) => manifest[workspace]))
const [major, minor] = stableBase.split('.').map(Number)
const manifestBase = isMajor ? `${major + 1}.0.0` : `${major}.${minor + 1}.0`

// …but never go backwards: if a higher `x.y.z-rc.n` line is already published
// (e.g. an in-progress `3.0.0-rc.*`), continue that line instead. This is what
// stops a stale manifest from downgrading the rc tag.
const publishedRcBases = existing
  .map((v) => /^(\d+\.\d+\.\d+)-rc\.\d+$/.exec(v)?.[1])
  .filter((v): v is string => v !== undefined)
const base = maxStable([manifestBase, ...publishedRcBases])

// Pick the next free rc number for that base rather than always colliding on
// `-rc.0` (which pnpm then silently skips).
const prefix = `${base}-rc.`
const usedRcNumbers = existing
  .filter((v) => v.startsWith(prefix))
  .map((v) => Number(v.slice(prefix.length)))
  .filter((n) => Number.isInteger(n))
const nextRc = usedRcNumbers.length > 0 ? Math.max(...usedRcNumbers) + 1 : 0
const targetVersion = `${prefix}${nextRc}`

echo`found ${chalk.blue(publishable.length)} workspace(s) to publish ${
  isMajor ? 'major ' : ''
}release candidate ${chalk.green(targetVersion)} for`

for (const {name, version} of publishable) {
  await spinner(`bumping ${chalk.blue(name)} from ${chalk.yellow(version)}`, async () => {
    // `pnpm version` is really just an alias for `npm version` atm, so we have to jump through some hoops
    await $`pnpm --filter="${name}" exec pnpm version --no-commit-hooks --no-git-tag-version ${targetVersion}`
  })
  echo`bumped ${chalk.blue(name)} from ${chalk.yellow(version)} to ${chalk.green(targetVersion)}`
}

await $`pnpm build --output-logs=errors-only`.pipe(process.stdout)

for (const {name} of publishable) {
  // Capture (rather than stream) the output so we can detect pnpm's silent skip.
  const {stdout} = await $`pnpm --filter="${name}" publish --tag rc --no-git-checks ${publishArgs}`
  process.stdout.write(stdout)
  // A filtered/recursive `pnpm publish` exits 0 with this message when the
  // target version already exists on the registry. Treat it as a hard failure
  // so a release can never be reported as successful without actually publishing.
  if (stdout.includes('There are no new packages that should be published')) {
    throw new Error(
      `${name}@${targetVersion} was not published — pnpm reported nothing to publish, ` +
        `so this version likely already exists on the registry.`,
    )
  }
}

echo`published release candidates for ${chalk.blue(publishable.length)} workspace(s)`
