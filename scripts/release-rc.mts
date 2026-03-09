#!/usr/bin/env zx
import 'zx/globals'
/* eslint-disable @typescript-eslint/no-unused-expressions */

const isMajor = process.argv.includes('--major')

const {packages} = await fs.readJson('./release-please-config.json')
const workspaces = Object.keys(packages)
const manifest: Record<string, string> = await fs.readJson('./.release-please-manifest.json')

echo`found ${chalk.blue(workspaces.length)} workspaces to publish ${isMajor ? 'major ' : ''}release candidates for`

const prev = new Map()
const next = new Map()

for (const workspace of workspaces) {
  const {name, version, private: isPrivate} = await fs.readJson(`./${workspace}/package.json`)
  if (!isPrivate) {
    await spinner(`bumping ${chalk.blue(name)} from ${chalk.yellow(version)}`, async () => {
      prev.set(name, version)
      const stableVersion = manifest[workspace]
      const [major, minor] = stableVersion.split('.').map(Number)
      const targetVersion = isMajor ? `${major + 1}.0.0-rc.0` : `${major}.${minor + 1}.0-rc.0`
      // `pnpm version` is really just an alias for `npm version` atm, so we have to jump through some hoops
      await $`pnpm --filter="${name}" exec pnpm version --no-commit-hooks --no-git-tag-version ${targetVersion}`
      next.set(name, (await fs.readJson(`./${workspace}/package.json`)).version)
    })
    echo`bumped ${chalk.blue(name)} from ${chalk.yellow(prev.get(name))} to ${chalk.green(next.get(name))}`
  }
}

await $`pnpm build --output-logs=errors-only`.pipe(process.stdout)

for (const name of next.keys()) {
  await $`pnpm --filter="${name}" publish --tag rc --no-git-checks`.pipe(process.stdout)
}

echo`published release candidates for ${chalk.blue(workspaces.length)} workspaces`
