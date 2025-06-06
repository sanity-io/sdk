#!/usr/bin/env zx
import 'zx/globals'
/* eslint-disable @typescript-eslint/no-unused-expressions */

const {packages} = await fs.readJson('./release-please-config.json')
const workspaces = Object.keys(packages)

echo`found ${chalk.blue(workspaces.length)} workspaces to publish canaries for`

const prev = new Map()
const next = new Map()

for (const workspace of workspaces) {
  const {name, version, private: isPrivate} = await fs.readJson(`./${workspace}/package.json`)
  if (!isPrivate) {
    await spinner(`bumping ${chalk.blue(name)} from ${chalk.yellow(version)}`, async () => {
      prev.set(name, version)
      // `pnpm version` is really just an alias for `npm version` atm, so we have to jump through some hoops
      await $`pnpm --filter="${name}" exec pnpm version --no-commit-hooks --no-git-tag-version --preid rc prerelease`
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
