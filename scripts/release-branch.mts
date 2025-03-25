#!/usr/bin/env zx
import 'zx/globals'
/* eslint-disable @typescript-eslint/no-unused-expressions */

// Creates a new version based on the current branch name and commit

const {packages} = await fs.readJson('./release-please-config.json')
const workspaces = Object.keys(packages)

echo`found ${chalk.blue(workspaces.length)} workspaces to publish canaries for`

const prev = new Map()
const next = new Map()

// Get current commit SHA (short version)
const commitSha = (await $`git rev-parse --short HEAD`).stdout.trim()
// Get current branch name (replace / with _ for valid npm version)
const branch = (await $`git rev-parse --abbrev-ref HEAD | sed 's/\\//\\_/g'`).stdout.trim()

const tag = `${branch === 'main' ? 'next' : branch}+${commitSha}`

for (const workspace of workspaces) {
  const {name, version, private: isPrivate} = await fs.readJson(`./${workspace}/package.json`)
  if (!isPrivate) {
    await spinner(`bumping ${chalk.blue(name)} from ${chalk.yellow(version)}`, async () => {
      prev.set(name, version)
      // Create version with branch name and commit SHA
      await $`pnpm --filter="${name}" exec pnpm version --no-commit-hooks --no-git-tag-version --preid ${tag} prerelease`
      next.set(name, (await fs.readJson(`./${workspace}/package.json`)).version)
    })
    echo`bumped ${chalk.blue(name)} from ${chalk.yellow(prev.get(name))} to ${chalk.green(next.get(name))}`
  }
}

await $`pnpm build --output-logs=errors-only`.pipe(process.stdout)

for (const name of next.keys()) {
  await $`pnpm --filter="${name}" publish --tag ${tag} --no-git-checks`.pipe(process.stdout)
}

echo`published versions for ${chalk.blue(workspaces.length)} workspaces`
