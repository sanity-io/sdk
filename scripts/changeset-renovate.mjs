import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'

// Writes a changeset for a Renovate production dependency update so the bump
// ships a patch release through Changesets. Renovate calls this from
// `postUpgradeTasks` with template vars:
//   pnpm changeset:renovate <branchName> <depName@newVersion>...
// The filename is derived from the branch so a rebase overwrites the same file
// (deterministic) and a grouped PR produces a single changeset.
const [branchName, ...deps] = process.argv.slice(2)

if (!branchName || deps.length === 0) {
  throw new Error(
    'Usage: changeset-renovate <branchName> <depName@newVersion>...\n' +
      'Requires a branch name and at least one dependency argument.',
  )
}

const slug = branchName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^renovate-/, '')
const body = `Update dependencies: ${deps.map((dep) => `\`${dep}\``).join(', ')}`

const contents = `---
'@sanity/sdk': patch
'@sanity/sdk-react': patch
---

${body}
`

mkdirSync('.changeset', {recursive: true})
writeFileSync(join('.changeset', `renovate-${slug}.md`), contents)
