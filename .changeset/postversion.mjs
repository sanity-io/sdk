import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import process from 'node:process'

const REPO = 'sanity-io/sdk'
const REPO_URL = `https://github.com/${REPO}`
// Both @sanity/sdk and @sanity/sdk-react are fixed-versioned and cut under a single sdk-vX.Y.Z tag.
const TAG_PREFIX = 'sdk-v'

const SECTION_MAP = {
  'Major Changes': '⚠ BREAKING CHANGES',
  'Minor Changes': 'Features',
  'Patch Changes': 'Bug Fixes',
}

function readPublicPackage(pkgDir) {
  const pkgJsonPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgJsonPath)) return null
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  if (pkg.private) return null
  return {dir: pkgDir, name: pkg.name, version: pkg.version}
}

function listSubdirs(dir) {
  return readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function expandPackageDirs(packagesDir) {
  return listSubdirs(packagesDir).flatMap((name) => {
    const dir = join(packagesDir, name)
    if (!name.startsWith('@')) return [dir]
    return listSubdirs(dir).map((sub) => join(dir, sub))
  })
}

function discoverPackages() {
  const packagesDir = resolve('packages')
  if (!existsSync(packagesDir)) return []
  return expandPackageDirs(packagesDir).map(readPublicPackage).filter(Boolean)
}

function isDepContinuationLine(line) {
  return line === '' || /^\s{2,}/.test(line)
}

function extractDepBlock(section) {
  const marker = '- The following workspace dependencies were updated'
  const idx = section.indexOf(marker)
  if (idx === -1) return {section, depBlock: null}

  const lines = section.slice(idx).split('\n')
  const stopIndex = lines.slice(1).findIndex((line) => !isDepContinuationLine(line))
  const endLine = stopIndex === -1 ? lines.length : stopIndex + 1

  const rawBlock = lines.slice(0, endLine).join('\n')
  const cleaned = section.slice(0, idx) + section.slice(idx + rawBlock.length)
  return {section: cleaned, depBlock: rawBlock.trimEnd()}
}

function isEmptySectionAt(parts, i) {
  if (!parts[i].startsWith('### ')) return false
  const nextContent = parts[i + 1] ?? ''
  return nextContent.trim().length === 0
}

function removeEmptySections(text) {
  const parts = text.split(/(^### .*$)/m)
  const result = []
  for (let i = 0; i < parts.length; i++) {
    if (isEmptySectionAt(parts, i)) {
      i++
    } else {
      result.push(parts[i])
    }
  }
  return result.join('')
}

function findVersionHeading(content, currentVersion) {
  const match = content.match(/^## (\d+\.\d+\.\d+)\s*$/m)
  if (!match) return null
  return match[1] === currentVersion ? match : null
}

function buildCompareUrl(after, currentVersion) {
  const prevMatch = after ? after.match(/^## \[?(\d+\.\d+\.\d+)/m) : null
  if (prevMatch) {
    return `${REPO_URL}/compare/${TAG_PREFIX}${prevMatch[1]}...${TAG_PREFIX}${currentVersion}`
  }
  return `${REPO_URL}/releases/tag/${TAG_PREFIX}${currentVersion}`
}

function formatSectionBody(rawSection) {
  let section = rawSection
  for (const [from, to] of Object.entries(SECTION_MAP)) {
    section = section.replace(new RegExp(`^### ${from}$`, 'm'), `### ${to}`)
  }

  const {section: withoutDeps, depBlock} = extractDepBlock(section)
  section = removeEmptySections(withoutDeps).replace(/\n{3,}/g, '\n\n')

  if (depBlock) {
    return `${section.trimEnd()}\n\n### Dependencies\n\n${depBlock}\n\n`
  }
  return section
}

function transformChangelog(content, currentVersion) {
  const match = findVersionHeading(content, currentVersion)
  if (!match) return content

  const headingEnd = match.index + match[0].length
  const afterHeading = content.slice(headingEnd)
  if (afterHeading.trimStart().startsWith('[Compare changes](')) return content

  const nextVersionMatch = afterHeading.match(/^## /m)
  const sectionEnd = nextVersionMatch ? headingEnd + nextVersionMatch.index : content.length

  const before = content.slice(0, match.index)
  const after = content.slice(sectionEnd)
  const compareUrl = buildCompareUrl(after, currentVersion)
  const today = new Date().toISOString().split('T')[0]

  // changesets/action finds a release entry by matching the version heading exactly.
  // Keep the heading plain and put the comparison link below it.
  const withHeader = content
    .slice(match.index, sectionEnd)
    .replace(
      `## ${currentVersion}`,
      `## ${currentVersion}\n\n[Compare changes](${compareUrl})\n\n_${today}_`,
    )

  return before + formatSectionBody(withHeader) + after
}

const packages = discoverPackages()
let transformed = 0

for (const pkg of packages) {
  const changelogPath = join(pkg.dir, 'CHANGELOG.md')
  if (!existsSync(changelogPath)) continue

  const content = readFileSync(changelogPath, 'utf8')
  const result = transformChangelog(content, pkg.version)

  if (result !== content) {
    writeFileSync(changelogPath, result)
    process.stdout.write(`  ${pkg.name} CHANGELOG.md transformed\n`)
    transformed++
  }
}

if (transformed === 0) {
  process.stdout.write('No changelogs needed transformation\n')
} else {
  process.stdout.write(`\nTransformed ${transformed} changelog(s)\n`)
}
