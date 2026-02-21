/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

// Determine workspace root relative to the script's location (__dirname)
// In an ES module context, __dirname is not available directly.
// We use import.meta.url to get the current module's URL, convert it to a file path,
// and then resolve the workspace root.
const currentFilePath = new URL(import.meta.url).pathname
const currentDir = path.dirname(currentFilePath)
const workspaceRoot = path.resolve(currentDir, '..') // Assumes the script is in /scripts

const docsDir = path.join(workspaceRoot, 'docs')
const packageJsonPath = path.join(workspaceRoot, 'package.json')
const reactIndexPath = path.join(workspaceRoot, 'packages', 'react', 'src', '_exports', 'index.ts')
const coreIndexPath = path.join(workspaceRoot, 'packages', 'core', 'src', '_exports', 'index.ts')

interface PackageJson {
  name?: string
  version?: string
}

function generateLlmsTxt(packageName: string): string {
  const content = `
userAgent: ${packageName}-docs-bot
include: https://www.npmjs.com/package/@sanity/sdk
include: https://www.npmjs.com/package/@sanity/sdk-react

# Discourage indexing of older libraries/docs that might confuse users
disallow: /sanity/
disallow: /@sanity/client/
disallow: https://www.sanity.io/docs/

# Canonical docs URL
sitemap: https://sdk-docs.sanity.dev/sitemap.xml # Assuming a sitemap exists or will exist here
# Alternatively, if no sitemap:
# canonical: https://sdk-docs.sanity.dev

# Reference the human-readable summaries
@file: sdk-summary.txt
@file: sdk-react-summary.txt
`
  return content.trim()
}

function generateSdkSummaryTxt(coreExports: string[]): string {
  const coreExportList =
    coreExports.length > 0
      ? coreExports.map((exp) => `- \`${exp}\``).join('\n')
      : '- *No key exports found (or parser failed). Check `packages/core/src/_exports/index.ts`.*'

  const content = `
# Sanity SDK Summary

This file provides a brief overview of the main Sanity SDK packages for LLM context, clarifying their relationship and primary use cases.

## @sanity/sdk

**Role:** Foundation / Core API

This is the foundational JavaScript library for interacting with your Sanity Content Lake. It provides the core methods for querying, mutating, listening to changes, handling authentication, managing assets, and resolving intents. It is framework-agnostic.

**Primary Audience:** Developers building non-React applications (Node.js, Svelte, Vue, Vanilla JS) or those building custom frameworks/integrations on top of Sanity.

**Key Exports:**
${coreExportList}

## @sanity/sdk-react

**Role:** React Integration Layer

This package builds upon \`@sanity/sdk\`, providing convenient React Hooks for integrating Sanity functionality seamlessly into React applications. It simplifies state management, data fetching, real-time updates, and context awareness within the React lifecycle.

**Primary Audience:** Developers building websites or applications using React or React-based frameworks (like Next.js, Remix).

A dynamically generated list of available hooks can be found in \`sdk-react-summary.txt\`.

## Example Usage (TypeScript/React)

This example shows how \`@sanity/sdk-react\` hooks (like \`useCurrentUser\`, \`useQuery\`) are typically used. Under the hood, these hooks utilize the core functionality provided by \`@sanity/sdk\`.

\`\`\`typescript
import { useCurrentUser, useQuery } from "@sanity/sdk-react";
// import { createClient } from "@sanity/sdk"; // Core client might be configured elsewhere

// const client = createClient({...}); // Client instance likely used by hooks internally

const query = '*[_type == "post"]{title, slug}';

function MyComponent() {
  const { data: user, loading: userLoading } = useCurrentUser(); // React hook
  const { data: posts, loading: postsLoading } = useQuery(query); // React hook

  if (userLoading || postsLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Welcome, {user?.name ?? 'Guest'}!</h1>
      <h2>Recent Posts:</h2>
      <ul>
        {posts?.map((post: any) => (
          <li key={post.slug.current}>
            {post.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MyComponent;
\`\`\`

For full documentation, visit: https://sdk-docs.sanity.dev
`
  return content.trim()
}

/**
 * Extracts exported React hook names (use*) from a TypeScript file.
 * This is a simple parser and might not catch all edge cases (e.g., complex re-exports).
 */
function extractReactHooks(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: React index file not found at ${filePath}. Cannot extract hooks.`)
    return []
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const lines = fileContent.split('\n')
  const hookNames = new Set<string>()
  // Regex to find potential hook names (useSomething) inside export statements
  // Looks for `use` followed by an uppercase letter and word characters
  const hookRegex = /\b(use[A-Z]\w*)\b/g
  // Regex to check if the line is likely an export statement
  // Matches `export { ... }` or `export type/interface/const/function ...`
  const exportRegex = /^\s*export\s+(?:(?:type|interface|class|function|const|let|var)\s+|\{)/

  lines.forEach((line) => {
    // Check if the line looks like an export statement
    if (exportRegex.test(line.trim())) {
      let match
      // Find all hook patterns on that line
      while ((match = hookRegex.exec(line)) !== null) {
        // Add the found hook name (match[1]) to the set
        hookNames.add(match[1])
      }
    }
  })

  // Note: This simple parser doesn't handle re-exports like `export * from './hooks'`.

  return Array.from(hookNames).sort() // Return sorted array
}

/**
 * Extracts exported identifiers (functions, classes, consts) from a TypeScript file.
 * This is a simple parser and might not catch all edge cases (e.g., complex re-exports, default exports).
 */
function extractCoreSdkExports(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: Core SDK index file not found at ${filePath}. Cannot extract exports.`)
    return []
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const lines = fileContent.split('\n')
  const exportNames = new Set<string>()

  // Regex for `export { identifier, ... }` or `export { identifier as alias, ... }`
  const namedExportRegex = /^\s*export\s+\{([^}]+)\}/
  // Regex for `export const identifier = ...`, `export function identifier(...)`, `export class identifier ...`
  const declarationExportRegex = /^\s*export\s+(?:const|let|var|function|class)\s+([A-Za-z_]\w*)/
  // Regex for identifiers within the {} of named exports, potentially with aliases
  const identifierInNamedExportRegex = /\b([A-Za-z_]\w*)\b(?:\s+as\s+[A-Za-z_]\w*)?/g

  lines.forEach((line) => {
    const trimmedLine = line.trim()

    // Match `export { ... }`
    const namedMatch = trimmedLine.match(namedExportRegex)
    if (namedMatch && namedMatch[1]) {
      const identifiersPart = namedMatch[1]
      let idMatch
      while ((idMatch = identifierInNamedExportRegex.exec(identifiersPart)) !== null) {
        // Capture the original identifier name (before potential `as` alias)
        exportNames.add(idMatch[1])
      }
    }

    // Match `export const/function/class ...`
    const declarationMatch = trimmedLine.match(declarationExportRegex)
    if (declarationMatch && declarationMatch[1]) {
      exportNames.add(declarationMatch[1])
    }
  })

  // Note: This doesn't handle `export * from ...` or `export default ...` well.

  return Array.from(exportNames).sort()
}

/**
 * Generates the content for the React SDK summary file.
 */
function generateSdkReactSummaryTxt(hooks: string[]): string {
  const hookList =
    hooks.length > 0
      ? hooks.map((hook) => `- \`${hook}\``).join('\n') // Format as markdown list items
      : '- *No hooks found (or parser failed). Check `packages/react/src/_exports/index.ts`.*'

  const content = `
# @sanity/sdk-react Hooks Summary

This file lists the publicly exported React hooks available in the \`@sanity/sdk-react\` package. This list is generated automatically by analyzing the package's exports.

## Available Hooks

${hookList}

For detailed usage and documentation, please visit the main SDK documentation site:
https://sdk-docs.sanity.dev
`
  return content.trim()
}

try {
  // Ensure docs directory exists
  if (!fs.existsSync(docsDir)) {
    console.log(`Creating directory: ${docsDir}`)
    fs.mkdirSync(docsDir, {recursive: true})
  }

  // Read package.json
  let packageName = 'sanity-sdk-package' // Default fallback
  if (fs.existsSync(packageJsonPath)) {
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8')
    const packageJsonData: PackageJson = JSON.parse(packageJsonContent)
    if (packageJsonData.name) {
      // Use the root package name for the user agent
      packageName = packageJsonData.name
    } else {
      console.warn('Warning: Could not find "name" in package.json. Using default.')
    }
  } else {
    console.warn(
      `Warning: package.json not found at ${packageJsonPath}. Using default package name.`,
    )
  }

  // --- Generate Core SDK Exports List ---
  const coreSdkExports = extractCoreSdkExports(coreIndexPath)

  // --- Generate React Hooks Summary ---
  const reactHooks = extractReactHooks(reactIndexPath)
  const reactSummaryPath = path.join(docsDir, 'sdk-react-summary.txt')
  const reactSummaryContent = generateSdkReactSummaryTxt(reactHooks)
  fs.writeFileSync(reactSummaryPath, reactSummaryContent, 'utf-8')
  console.log(`Generated ${reactSummaryPath} (found ${reactHooks.length} hooks)`)

  // --- Generate llms.txt (references the new file) ---
  const llmsTxtPath = path.join(docsDir, 'llms.txt')
  const llmsTxtContent = generateLlmsTxt(packageName)
  fs.writeFileSync(llmsTxtPath, llmsTxtContent, 'utf-8')
  console.log(`Generated ${llmsTxtPath}`)

  // --- Generate sdk-summary.txt (now with core exports and better descriptions) ---
  const sdkSummaryPath = path.join(docsDir, 'sdk-summary.txt')
  const sdkSummaryContent = generateSdkSummaryTxt(coreSdkExports) // Pass core exports
  fs.writeFileSync(sdkSummaryPath, sdkSummaryContent, 'utf-8')
  console.log(`Generated ${sdkSummaryPath} (found ${coreSdkExports.length} core exports)`)

  console.log('LLM helper files generated successfully.')
} catch (error) {
  console.error('Error generating LLM helper files:', error)
  process.exit(1)
}
