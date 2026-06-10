/**
 * This script does the following:
 * 1. checks your config (see "Env" below to see what's needed)
 * 2. Creates a prompt for a Claude agent (via its SDK) which:
 *    - reads the latest AILF score report
 *    - locates the affected articles in the docs dataset
 *    - prints proposed changes as markdown to stdout
 * It's also using the Sanity MCP server pointed (read-only)
 * at the docs project/dataset.
 *
 * It's intentionally limited; we try to enforce read-only tools and it's highly encouraged to use a read-only token.
 * (We could add another step to check the token's permissions if deemed necessary)
 *
 * Usage:
 *   pnpm ailf:improve-docs [--verbose]
 *
 * Flags:
 *   --verbose                  stream the agent's tool calls to stderr while
 *                              it works (stdout still ends up as the proposal
 *                              markdown)
 *
 * Env:
 *   SANITY_DOCS_READ_TOKEN     required; read access to the docs dataset is
 *                              enough — prefer a token that cannot write at all and is only scoped to publicly available content.
 *   ANTHROPIC_API_KEY          required; auth for the Anthropic API the agent runs against.
 *
 * The docs project/dataset come from .ailf/ailf.config.ts.
 */

import {createWriteStream, existsSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {pathToFileURL} from 'node:url'

import {query} from '@anthropic-ai/claude-agent-sdk'

const PKG_DIR = path.dirname(import.meta.dirname)
const AILF_DIR = path.join(PKG_DIR, '.ailf')
const CONFIG = path.join(AILF_DIR, 'ailf.config.ts')
const REPORT = path.join(AILF_DIR, 'results', 'latest', 'report.md') // we could turn this into a variable later
const METADATA = path.join(path.dirname(REPORT), 'job-metadata.json')
const OUT_DIR = path.dirname(REPORT)

const VERBOSE = process.argv.includes('--verbose')

function fail(message: string): never {
  // eslint-disable-next-line no-console
  console.error(`error: ${message}`)
  process.exit(1)
}

// Progress narration goes to stderr not because it's an error,
// but because we want stdout to stay clean for the report.
// in other words, `pnpm improve-docs > proposal.md` must produce just the proposal markdown.
function progress(message = ''): void {
  // eslint-disable-next-line no-console
  console.error(message)
}

if (!existsSync(REPORT)) fail(`no AILF report at ${REPORT} — run 'pnpm eval' first`)
const SANITY_DOCS_READ_TOKEN =
  process.env['SANITY_DOCS_READ_TOKEN'] ??
  fail('Set SANITY_DOCS_READ_TOKEN (read access to the docs dataset)')

if (!process.env['ANTHROPIC_API_KEY']) fail('Set ANTHROPIC_API_KEY (auth for the Anthropic API)')

// The docs project/dataset come from the config file, so we're reading and writing to the same source of truth.
// Node ≥22.18 strips TS types natively, so the config loads as a real module.
if (!existsSync(CONFIG)) fail(`missing ${CONFIG}`)
let cfgProject = ''
let cfgDataset = ''
try {
  const mod = await import(pathToFileURL(CONFIG).href)
  const src = mod.default?.source ?? {}
  cfgProject = src.projectId ?? ''
  cfgDataset = src.dataset ?? ''
} catch (err) {
  fail(`could not evaluate ${CONFIG}: ${err}`)
}
const PROJECT_ID = cfgProject || fail(`set source.projectId in ${CONFIG}`)
const DATASET = cfgDataset || fail(`set source.dataset in ${CONFIG}`)

const REPORT_ID = await readFile(METADATA, 'utf8')
  .then((raw) => JSON.parse(raw).reportId ?? 'unknown')
  .catch(() => 'unknown')

progress('AILF docs improvement proposals')
progress(`  docs source : ${PROJECT_ID}/${DATASET} (read-only)`)
progress(`  report      : ${REPORT} (id: ${REPORT_ID})`)
progress()

// Specify read-only tools
const ALLOWED_TOOLS = [
  'mcp__sanity-docs__get_schema',
  'mcp__sanity-docs__query_documents',
  'mcp__sanity-docs__get_document',
  'mcp__sanity-docs__semantic_search',
  'mcp__sanity-docs__list_embeddings_indices',
  'mcp__sanity-docs__search_docs',
  'mcp__sanity-docs__read_docs',
  'mcp__sanity-docs__list_sanity_rules',
  'mcp__sanity-docs__get_sanity_rules',
]
const DISALLOWED_TOOLS = [
  'mcp__sanity-docs__publish_documents',
  'mcp__sanity-docs__publish_document',
  'mcp__sanity-docs__publish_release',
  'mcp__sanity-docs__create_release',
  'mcp__sanity-docs__edit_release',
  'mcp__sanity-docs__schedule_release',
  'mcp__sanity-docs__create_version',
  'mcp__sanity-docs__version_replace_document',
  'mcp__sanity-docs__version_discard',
  'mcp__sanity-docs__version_unpublish_document',
  'mcp__sanity-docs__unpublish_documents',
  'mcp__sanity-docs__discard_drafts',
  'mcp__sanity-docs__edit_document',
  'mcp__sanity-docs__create_documents',
  'mcp__sanity-docs__create_document',
  'mcp__sanity-docs__patch_document',
  'mcp__sanity-docs__delete_document',
  'mcp__sanity-docs__transform_document',
  'mcp__sanity-docs__translate_document',
  'mcp__sanity-docs__deploy_schema',
  'mcp__sanity-docs__deploy_studio',
  'mcp__sanity-docs__create_dataset',
  'mcp__sanity-docs__update_dataset',
  'mcp__sanity-docs__create_project',
  'mcp__sanity-docs__add_cors_origin',
  'mcp__sanity-docs__generate_image',
  'mcp__sanity-docs__transform_image',
]

const report = await readFile(REPORT, 'utf8')

const prompt = `You are a senior documentation engineer reviewing the Sanity docs against an
AI Literacy Framework (AILF) evaluation report. AILF measures how well the
docs enable AI coding tools to implement features correctly; the low-scoring
judgments below mean agents misused or invented APIs because the docs were
missing, ambiguous, or incomplete.

Docs content lake: project ${PROJECT_ID}, dataset ${DATASET}. You have READ-ONLY
access. Do not attempt to write, and do not propose that you write — your
entire deliverable is the markdown proposal described at the end.

## Your job

1. Call get_schema first, so you understand the docs document types before
   querying.
2. Study the report below, especially the "Low-Scoring Judgments". Distill a
   SHORT list of concrete documentation gaps. Good gap statements name the
   exact API surface, e.g. "usePaginatedDocuments' return shape (loadMore,
   hasMore, isPending) is not documented" — not vague advice like "improve
   the hooks docs".
3. For each gap, locate the existing article(s) that should cover it using
   query_documents / get_document, and read enough of each article to know
   exactly where the fix belongs and what the surrounding content looks like.
   Strongly prefer improving existing articles over proposing new ones; if a
   gap has no sensible home, mark it "needs a new article".
4. Compose the fixes and output the proposal. Then stop.

## Composing the fixes

- Make the smallest edit that closes the gap: add the missing signature,
  return shape, option name, or a short corrective example. Do not rewrite
  articles wholesale.
- Match the structure, tone, and formatting conventions of the surrounding
  content in each article. Mirror how existing code examples in the dataset
  are marked up.
- Never document an API surface you are not sure exists — when uncertain,
  leave it out and flag it under "Not addressed".

## Output format

Reply ONLY with the proposal document, no preamble. It is printed to stdout
and saved as a report, so it must be self-contained markdown:

    # Proposed docs improvements — AILF report ${REPORT_ID}

    ## Gaps identified
    (numbered list; one line each, referencing the judgments they come from)

    ## Proposed changes

    ### Change 1: <short title>
    - **Document:** <_id> — "<article title>"
    - **Field/path:** <where in the document, e.g. body block index / section heading>
    - **Addresses:** gap(s) #n
    - **Location context:** quote the 1-3 existing sentences or the heading
      the change anchors to, so a human can find the spot instantly.

    **Current** (omit if purely an addition):
    > quoted existing text

    **Proposed:**
    (the exact new/replacement content, ready to paste — prose and/or code)

    **Why:** one or two sentences tying it back to the judgments.

    ## Not addressed
    (gaps you could not place or were unsure about, and why)

---

## AILF report

${report}
`

const PROPOSAL_FILE = path.join(OUT_DIR, 'docs-improvement.md')

const result = query({
  prompt,
  options: {
    mcpServers: {
      // renamed because we want to avoid conflicts with the "sanity" server that many Sanity devs already have cached
      'sanity-docs': {
        type: 'http',
        url: 'https://mcp.sanity.io',
        headers: {Authorization: `Bearer ${SANITY_DOCS_READ_TOKEN}`},
        // required: we want to block the agent until the MCP server is ready, since we've disabled built-in tools
        alwaysLoad: true,
      },
    },
    strictMcpConfig: true,
    tools: [], // no built-in tools (Bash, Write, …) — MCP read tools only
    allowedTools: ALLOWED_TOOLS,
    disallowedTools: DISALLOWED_TOOLS,
    permissionMode: 'dontAsk', // headless: anything not allowlisted is denied
    maxTurns: 60,
  },
})

// Stream the agent's activity (tool calls, text) to stderr as it happens;
// devs can see what the agent is trying to do and iterate on the prompt as needed.
const streamFile = VERBOSE
  ? createWriteStream(path.join(OUT_DIR, 'docs-improvement.stream.jsonl'))
  : null

let proposal: string | null = null
for await (const message of result) {
  streamFile?.write(`${JSON.stringify(message)}\n`)
  if (message.type === 'assistant') {
    if (!VERBOSE) continue
    for (const block of message.message.content) {
      if (block.type === 'tool_use') {
        const input = JSON.stringify(block.input ?? {})
        progress(`→ ${block.name} ${input.length > 120 ? `${input.slice(0, 120)}…` : input}`)
      } else if (block.type === 'text' && block.text.trim()) {
        progress(`· ${block.text.trim().split('\n')[0].slice(0, 120)}`)
      }
    }
  } else if (message.type === 'result') {
    if (VERBOSE) {
      const cost = message.total_cost_usd?.toFixed(2) ?? '?'
      const secs = Math.round((message.duration_ms ?? 0) / 1000)
      progress(`✓ done (${message.num_turns} turns, $${cost}, ${secs}s)`)
    }
    if (message.subtype !== 'success' || message.is_error) {
      const detail = 'errors' in message ? message.errors.join('; ') : message.subtype
      fail(`agent run failed: ${detail || message.subtype}`)
    }
    proposal = message.result
  }
}
streamFile?.end()

if (proposal === null) fail('no result message received from the agent')

process.stdout.write(proposal)
await writeFile(PROPOSAL_FILE, proposal)

progress()
progress(`Proposal also saved to ${PROPOSAL_FILE}`)
