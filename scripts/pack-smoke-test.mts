/* eslint-disable no-console */
import {execFileSync} from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {transformSync} from 'esbuild'

// Smoke test for the published tarballs. `pnpm build` output looks fine to every
// in-repo consumer because the workspace exports map resolves the `source`
// condition to raw TypeScript, so nothing here ever loads `dist/`. Consumers on
// npm only get `dist/`, and a packaging regression there (like the untranspiled
// JSX that shipped in @sanity/sdk-react@2.20.0) is invisible until someone
// installs the tarball. This script packs each publishable package the same way
// `pnpm publish` does, then checks the result the way a bundler would:
//
// 1. Every entry in the published exports map must point at a file that exists
//    in the tarball.
// 2. Every JavaScript file under `dist/` must parse as plain JS. Vite and
//    esbuild parse `.js` files with JSX disabled, so raw JSX or TypeScript
//    syntax in the bundle breaks real installs even when Node can import it.
// 3. A TypeScript consumer must infer legacy types through the packed declarations.
//
// Run after building: `pnpm build:packages && pnpm test:pack`.

const BASE_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const PACKAGES = ['packages/core', 'packages/react']

/** Collects every file path referenced by an exports map value. */
function collectExportTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object' || value === null) return []
  return Object.values(value).flatMap(collectExportTargets)
}

/** Recursively finds JavaScript files (.js, .mjs, .cjs) under a directory. */
function findJsFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...findJsFiles(fullPath))
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) files.push(fullPath)
  }
  return files
}

let failures = 0

function fail(message: string): void {
  failures++
  console.error(`✗ ${message}`)
}

const tempDir = mkdtempSync(path.join(tmpdir(), 'sdk-pack-smoke-'))

try {
  for (const workspace of PACKAGES) {
    const packageDir = path.join(BASE_PATH, workspace)
    const sourceManifest = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
    const extractedRoot = path.join(tempDir, 'node_modules', sourceManifest.name)
    mkdirSync(extractedRoot, {recursive: true})
    const tarball = path.join(tempDir, `${path.basename(workspace)}.tgz`)
    // `pnpm pack` applies `publishConfig` overrides, so the extracted manifest
    // matches what `pnpm publish` would upload.
    execFileSync('pnpm', ['pack', '--out', tarball], {cwd: packageDir, stdio: 'pipe'})
    execFileSync('tar', ['-xzf', tarball, '--strip-components=1'], {
      cwd: extractedRoot,
      stdio: 'pipe',
    })
    const manifest = JSON.parse(readFileSync(path.join(extractedRoot, 'package.json'), 'utf8'))
    console.log(`\n${manifest.name}@${manifest.version}`)

    // Reuse installed external dependencies, but resolve SDK imports to the tarballs.
    for (const dependency of [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      '@types/node',
      ...(workspace === 'packages/react' ? ['@types/react', '@types/react-dom'] : []),
    ]) {
      const destination = path.join(tempDir, 'node_modules', dependency)
      if (existsSync(destination)) continue
      mkdirSync(path.dirname(destination), {recursive: true})
      symlinkSync(path.join(packageDir, 'node_modules', dependency), destination, 'dir')
    }

    // 1. Every published entry point must exist in the tarball.
    const targets = collectExportTargets(manifest.exports)
    for (const field of ['main', 'module', 'types'] as const) {
      if (typeof manifest[field] === 'string') targets.push(manifest[field])
    }
    for (const target of new Set(targets)) {
      if (existsSync(path.join(extractedRoot, target))) {
        console.log(`  ✓ entry point exists: ${target}`)
      } else {
        fail(`${manifest.name}: entry point missing from tarball: ${target}`)
      }
    }

    // 2. Every shipped JS file must parse as plain JS, the way Vite and esbuild
    // read `.js` files from node_modules.
    const distDir = path.join(extractedRoot, 'dist')
    const jsFiles = existsSync(distDir) ? findJsFiles(distDir) : []
    if (jsFiles.length === 0) {
      fail(`${manifest.name}: no JavaScript files under dist/ in the tarball`)
    }
    let parsed = 0
    for (const file of jsFiles) {
      try {
        transformSync(readFileSync(file, 'utf8'), {loader: 'js'})
        parsed++
      } catch (error) {
        const relative = path.relative(extractedRoot, file)
        fail(`${manifest.name}: ${relative} is not plain JavaScript`)
        console.error(error instanceof Error ? error.message : String(error))
      }
    }
    if (parsed > 0) console.log(`  ✓ ${parsed}/${jsFiles.length} dist files parse as plain JS`)
  }
  // Compile one legacy app through sdk-react, which also loads the packed core package.
  for (const filename of ['consumer.ts', 'legacy.types.ts']) {
    copyFileSync(
      path.join(BASE_PATH, 'scripts/fixtures/typegen', `${filename}.txt`),
      path.join(tempDir, filename),
    )
  }
  writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}')
  execFileSync(
    process.execPath,
    [
      path.join(BASE_PATH, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'es2022',
      '--module',
      'nodenext',
      '--types',
      'node',
      'consumer.ts',
    ],
    {cwd: tempDir, stdio: 'inherit'},
  )
  console.log('  ✓ legacy document, query, and projection inference')
} finally {
  rmSync(tempDir, {recursive: true, force: true})
}

if (failures > 0) {
  console.error(`\npack smoke test failed with ${failures} problem(s)`)
  process.exit(1)
}
console.log('\npack smoke test passed')
