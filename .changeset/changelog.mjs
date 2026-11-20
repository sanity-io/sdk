import process from 'node:process'

const CONVENTIONAL_COMMIT_RE = /^([a-z]+)(?:\(([^)]+)\))?!?:\s*([\s\S]+)/

async function fetchCommitPulls(commit, repo, token) {
  try {
    const res = await globalThis.fetch(
      `https://api.github.com/repos/${repo}/commits/${commit}/pulls`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
        },
      },
    )
    return res.ok ? await res.json() : []
  } catch {
    return []
  }
}

function extractAuthor(user) {
  if (!user || !user.login) return null
  const login = user.login.replace(/\[bot\]$/, '')
  return {login, url: user.html_url || `https://github.com/${login}`}
}

async function getPullRequestInfo(commit, repo) {
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- invoked by changesets, not a turbo task
  const token = process.env.GITHUB_TOKEN
  if (![token, commit, repo].every(Boolean)) return null

  const [firstPull] = await fetchCommitPulls(commit, repo, token)
  if (!firstPull) return null
  return {
    author: extractAuthor(firstPull.user),
    number: firstPull.number,
    title: firstPull.title,
  }
}

function parsePrNumberFromId(id) {
  const match = id.match(/^pr-(\d+)$/)
  return match ? parseInt(match[1], 10) : null
}

async function resolvePullRequest(id, commit, repo) {
  const pr = await getPullRequestInfo(commit, repo)
  if (pr) return {author: pr.author, prNumber: pr.number, prTitle: pr.title}
  return {author: null, prNumber: parsePrNumberFromId(id), prTitle: null}
}

function extractScope(text) {
  const match = (text || '').match(CONVENTIONAL_COMMIT_RE)
  return match ? match[2] || null : null
}

function parseSummary(summary, prTitle) {
  const trimmed = summary.trim()
  const summaryMatch = trimmed.match(CONVENTIONAL_COMMIT_RE)
  if (summaryMatch) {
    return {scope: summaryMatch[2] || null, description: summaryMatch[3].trim()}
  }
  return {scope: extractScope(prTitle), description: trimmed}
}

function formatLinks(repo, prNumber, commit) {
  if (!repo) return ''
  const prLink = prNumber ? ` ([#${prNumber}](https://github.com/${repo}/pull/${prNumber}))` : ''
  const commitLink = commit
    ? ` ([${commit.slice(0, 7)}](https://github.com/${repo}/commit/${commit}))`
    : ''
  return `${prLink}${commitLink}`
}

function formatAuthor(author) {
  if (!author) return ''
  return ` by [@${author.login}](${author.url})`
}

function formatBullet(scope, description, suffix) {
  const [firstLine, ...restLines] = description.split('\n')
  const scopePrefix = scope ? `**${scope}:** ` : ''
  const formatted = `${scopePrefix}${firstLine}${suffix}`
  if (restLines.length === 0) return `- ${formatted}`
  const indented = restLines.map((line) => (line ? `  ${line}` : line)).join('\n')
  return `- ${formatted}\n${indented}`
}

async function getReleaseLine(changeset, _type, options) {
  const repo = options ? options.repo : undefined
  const {commit, id, summary} = changeset
  const {author, prNumber, prTitle} = await resolvePullRequest(id, commit, repo)
  const {scope, description} = parseSummary(summary, prTitle)
  const suffix = `${formatLinks(repo, prNumber, commit)}${formatAuthor(author)}`
  return formatBullet(scope, description, suffix)
}

async function getDependencyReleaseLine(_changesets, dependenciesUpdated, _options) {
  if (dependenciesUpdated.length === 0) return ''

  const updates = dependenciesUpdated.map((dep) => `    - ${dep.name} bumped to ${dep.newVersion}`)

  return [
    '',
    '- The following workspace dependencies were updated',
    '  - dependencies',
    ...updates,
  ].join('\n')
}

export default {
  getReleaseLine,
  getDependencyReleaseLine,
}
