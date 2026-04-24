# Fallow evaluation

This is a non-blocking evaluation of [Fallow](https://github.com/fallow-rs/fallow) against the SDK monorepo. The goal is to decide whether Fallow is worth adopting in place of (or alongside) knip, and whether its duplication and complexity surfaces are worth wiring into our PR review flow.

Knip, ESLint, Prettier, TypeScript, the existing `pnpm depcheck` script, and the existing `Depcheck` CI workflow are all unchanged on this branch. Fallow runs from a new optional CI job that is `continue-on-error: true` and never blocks merges.

## Why we cared

1. AI-generated code tends to inline copies of utilities rather than reuse them, and it tends to grow `if` ladders inside existing functions instead of refactoring. We have no tooling that catches either today.
2. Knip only answers "is this connected?" Fallow answers that question (faster), plus three more: "is this duplicated?", "how complex is this?", and "what's the riskiest code in the repo right now?"

## How to reproduce

Fallow is installed as a pinned devDependency on this branch (`fallow@^2.48.4`). Pull the branch and run:

```bash
pnpm install
pnpm fallow:summary                       # totals across all commands
pnpm fallow dead-code --group-by package  # unused files / exports / deps
pnpm fallow dupes --skip-local            # cross-directory duplication
pnpm fallow:hotspots                      # churn × complexity, test files excluded
pnpm fallow:targets                       # ranked refactor backlog
pnpm fallow:audit                         # what would fail on this PR
```

The CI job [.github/workflows/fallow.yml](.github/workflows/fallow.yml) runs the summary, audit, and hotspots commands on every PR and renders the output into the job's step summary. It's `continue-on-error: true` and never blocks merges.

## Headline numbers

```
431 files analyzed (1.9s total for the all-in-one summary, sub-second per command)
59,414 LOC

Dead code:    23 issues
Duplication:  255 clone groups, 6,194 duplicated lines (11.1% total, default mode)
              27 cross-directory groups, 890 lines (default mode, --skip-local)
              125 cross-directory groups, 3,337 lines (6.0%, semantic mode, --skip-local)
Health:       54 functions above thresholds out of 4,331 analyzed
              Score: 83 / B
              Avg maintainability: 91.8 (good)
              1 circular dependency, 8 refactoring targets
```

For comparison, current knip output (`pnpm depcheck`):

```
Unused devDependencies (1)   # fallow itself, since we just added it
9 configuration hints suggesting we trim ignoreDependencies / ignoreBinaries
```

Knip says we're clean. Fallow finds 23 dead-code issues, 6.0% non-fixture cross-package duplication, and 8 ranked refactor targets. The 23 dead-code items need context, though, and I've triaged each one in section 6 below.

## How Fallow compares to our existing tooling

Command-by-command, mapping each Fallow surface to what we already run:

| Fallow command                                     | What it detects                                                                               | Existing tooling in this repo                                                                                                                                                   | Net change                                                                                                                                      | Adopt?                                                                                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fallow dead-code` (files, exports, deps, members) | Unused files, exports, dependencies, class members                                            | `knip` (via `pnpm depcheck`) + ESLint `unused-imports`                                                                                                                          | Parity on files/exports; small regression on deps because Fallow lacks knip's browserslist/prettier/npm-script/peer-dep plugins. See section 6. | **No** for now. Keep knip until Fallow's plugin coverage closes.                                                                                                               |
| `fallow dead-code` (circular deps)                 | Import cycles                                                                                 | ESLint `import/no-cycle` (enabled as `'error'` in [packages/@repo/config-eslint/index.mjs](packages/@repo/config-eslint/index.mjs), currently suppressed at three import sites) | Parity on detection; Fallow adds priority signal (fan-in × churn) the ESLint rule can't produce.                                                | **Yes, in addition to ESLint.** Keep `import/no-cycle` as the author-time guardrail against new cycles; use Fallow's ranking to prioritize fixing the existing suppressed one. |
| `fallow dupes`                                     | Cross-file and cross-package code duplication, including semantic matches (renamed variables) | None. No `jscpd`, no `sonarjs` plugin                                                                                                                                           | Net new                                                                                                                                         | **Yes.** No alternative in the toolchain; section 2's findings are all invisible today.                                                                                        |
| `fallow health`                                    | Cyclomatic complexity, cognitive complexity, CRAP score, maintainability index                | None. ESLint's built-in `complexity` rule is not configured; no `max-lines`, `max-lines-per-function`, `max-depth`; no `sonarjs` for cognitive complexity                       | Net new                                                                                                                                         | **Yes.** Directly addresses the "AI keeps adding `if` branches" problem called out in "Why we cared."                                                                          |
| `fallow health --hotspots`                         | Churn × complexity ranking from git history                                                   | None. Nothing we run consumes git history for code-quality weighting                                                                                                            | Net new                                                                                                                                         | **Yes.** Single most useful signal for review triage; no substitute.                                                                                                           |
| `fallow health --targets`                          | Ranked refactor backlog derived from hotspots + rules                                         | None                                                                                                                                                                            | Net new                                                                                                                                         | **Yes.** Same story as hotspots; low cost since it's output of the same pass.                                                                                                  |
| `fallow audit`                                     | Scoped composition of the above against changed files on a PR                                 | `pnpm depcheck` (dead-code slice only)                                                                                                                                          | Net new for duplication, complexity, hotspots                                                                                                   | **Yes, scoped.** Run on PRs for duplication, complexity, cycles. Leave dead-code/deps to knip.                                                                                 |
| `fallow flags`                                     | Feature-flag usage                                                                            | None, and we don't obviously need it                                                                                                                                            | Out of scope for this eval                                                                                                                      | **Skip** unless we start adopting a feature-flag framework.                                                                                                                    |

### Three takeaways:

- **Dead code and unused dependencies: knip is currently more accurate.** Knip ships plugins for browserslist, prettier, npm scripts, peer deps, and Playwright. Fallow doesn't. Out of the 23 dead-code findings below, 1 is a genuine unused export, 1 is a known-and-suppressed cycle, 1 looks like a Fallow analyzer bug, and 20 are Fallow missing plugin coverage that knip has. Those 20 are fixable by porting knip's `ignoreDependencies` and adding entry globs to `.fallowrc.json`, but the fix is suppression, not detection. If `@sanity/ui` were removed from kitchensink tomorrow, knip would surface `styled-components` as unused automatically; Fallow wouldn't, because the suppression is static.
- **Everything else is new.** Cross-package duplication, complexity (cyclomatic and cognitive), hotspots, refactor-target ranking, and priority-weighted cycle detection don't have any equivalent in what we run today. None of them are speculative either; section 2-5 show concrete findings in this repo for each.
- **Bottom line for adoption.** The case for Fallow is what knip and ESLint don't do, not doing their job better. Section 6's dead-code surface is currently a small net regression; sections 1-5 are a large net gain. The recommendation assumes both are acceptable and that we keep knip's existing suppression list as the starting point for `.fallowrc.json`.

## What Fallow finds that we currently miss

### 1. A real circular dependency in `packages/core`

```
packages/core/src/query/queryStore.ts
  -> releases/getPerspectiveState.ts
  -> releases/releasesStore.ts
  -> queryStore.ts
```

This is the top refactor target Fallow flags. It's marked as accelerating in the hotspot analysis (churn trending up over the last 6 months) and `queryStore.ts` has fan-in 8, meaning this cycle is reachable from a lot of code.

We already know about it: each of the three files has an identical comment block arguing it's "not a logical cycle" because `queryStore` never calls `getPerspectiveState` for the "raw" perspective that `releasesStore` uses, plus a `// eslint-disable-next-line import/no-cycle` on each offending import (the rule is `'error'` in [packages/@repo/config-eslint/index.mjs](packages/@repo/config-eslint/index.mjs)). `getPerspectiveState.ts:56` also lazily binds its action "to avoid circular import initialization issues with `releasesStore`." Knip doesn't flag cycles, so nothing in CI has been tracking this. What Fallow adds is the priority signal: accelerating churn on a file with fan-in 8 means the "logical, not real" argument is carrying more weight over time, and the fix (inject `getPerspectiveState` through the store context, or split out a shared `perspective/` module) would let us delete the three eslint-disables and the lazy-binding workaround together.

### 2. Cross-package code duplication that should be a shared utility

`fallow dupes --skip-local` (cross-directory only, 27 clone groups, 890 lines outside same-dir fixtures):

- `packages/core/src/query/queryStore.ts:144-169` is a 26-line block of RxJS subscription tracking (`distinctUntilChanged` on a `Set`, `pairwise`, `groupBy`, `mergeMap` to drive added/removed lifecycle) that is byte-identical to `packages/core/src/users/usersStore.ts:95-116`. Verified via `pnpm fallow dupes --trace packages/core/src/query/queryStore.ts:144`. This is exactly the "shared subscription helper that never got extracted" pattern.
- Same pair of files: a 20-line block at `queryStore.ts:383-402` and `usersStore.ts:345-364`. The `query/` and `users/` stores share a structural pattern that belongs in `packages/core/src/store/`.
- `packages/core/src/utils/getEnv.ts:2-20` is identical to `packages/react/src/utils/getEnv.ts:2-20`. Same 19 lines copied across the two published packages.
- `packages/react/src/hooks/documents/useDocuments.ts:235-260` matches `packages/react/src/hooks/paginatedDocuments/usePaginatedDocuments.ts:255-280` (26 lines). The two hooks share the same response-mapping logic.

In semantic mode (`fallow dupes --mode semantic --skip-local`, which catches clones where variables have been renamed) the cross-directory dup count rises to 125 groups, 3,337 lines, 6.0%. The biggest semantic family is `queryStore.ts` and `usersStore.ts` again: 4 clone groups totaling 169 lines.

### 3. Duplicate exports across barrel files

```
packages/core/src/comlink/controller/actions/destroyController.ts
  <-> comlinkControllerStore.ts (destroyController)
packages/core/src/comlink/controller/actions/getOrCreateChannel.ts
  <-> comlinkControllerStore.ts (getOrCreateChannel)
packages/core/src/comlink/controller/actions/getOrCreateController.ts
  <-> comlinkControllerStore.ts (getOrCreateController)
packages/core/src/comlink/controller/actions/releaseChannel.ts
  <-> comlinkControllerStore.ts (releaseChannel)
packages/core/src/comlink/node/actions/getOrCreateNode.ts
  <-> comlinkNodeStore.ts (getOrCreateNode)
packages/core/src/comlink/node/actions/releaseNode.ts
  <-> comlinkNodeStore.ts (releaseNode)
packages/core/src/auth/authStore.ts
  <-> dashboardUtils.ts (getDashboardOrganizationId)
```

Seven names that are exported from two different files. Fallow's note: "barrel re-exports may resolve ambiguously." Worth a deliberate pass to pick one home for each.

### 4. Hotspots: code that gets touched a lot AND is complex

This is the signal nothing else in our toolchain produces. Fallow multiplies git churn by complexity to surface code where refactoring pays back the most. Top of the list, with bus-factor and ownership signals:

```
83.3  packages/core/src/document/documentStore.ts          7 commits, fan-in 6,  bus=1
50.3 ▲ packages/core/src/query/queryStore.ts                6 commits, fan-in 8,  bus=1, accelerating
47.1  packages/core/src/document/reducers.ts                5 commits, fan-in 10, bus=1
45.3 ▼ packages/core/src/auth/subscribeToStateAndFetchCurrentUser.ts
38.4  apps/kitchensink-react/src/DocumentCollection/DocumentEditorRoute.tsx
36.8 ▲ packages/core/src/releases/getPerspectiveState.ts    accelerating, bus=1
33.4 ▲ packages/react/src/components/auth/LoginError.tsx    accelerating, bus=1
```

Several of these are flagged "bus=1 (at risk)" meaning a single recent contributor owns most of the changes, with a `drift` marker when ownership has shifted across versions. These are the files I'd ask reviewers to read carefully on any AI-assisted PR.

### 5. Refactoring targets, ranked by ROI

`fallow health --targets` does the work of "where should we spend refactoring effort?" for us:

```
20.0  pri:40.0  packages/core/src/query/queryStore.ts
              circular dependency  effort:medium  confidence:high
              "Break import cycle - 8 files depend on this, changes cascade through the cycle"

13.6  pri:27.2  packages/core/src/releases/getPerspectiveState.ts
              circular dependency  effort:medium  confidence:high

13.1  pri:26.1  packages/core/src/releases/releasesStore.ts
              circular dependency  effort:medium  confidence:high

 9.2  pri:18.4  packages/core/src/document/processMutations.ts
              "Extract processMutations (cognitive: 32) in 270-LOC file into smaller functions"

 9.0  pri:18.0  packages/react/src/hooks/document/useApplyDocumentActions.ts
              "Extract <arrow> (cognitive: 41) in 292-LOC file into smaller functions"

 8.6  pri:25.8  packages/core/src/document/processActions.ts
              "Extract processActions (cognitive: 181) in 736-LOC file into smaller functions"

 8.2  pri:16.4  packages/react/src/hooks/document/useDocumentPermissions.ts
              "Extract useDocumentPermissions (cognitive: 36) in 157-LOC file into smaller functions"

 4.2  pri:12.6  packages/core/src/document/patchOperations.ts
              "Extract insert (cognitive: 124) in 758-LOC file into smaller functions"
```

`processActions` in particular: cognitive complexity 181, 583 lines, in [packages/core/src/document/processActions.ts](packages/core/src/document/processActions.ts) which is also the second-highest churn file in the repo. This is the canonical "AI keeps adding `if` branches to a function that should be split."

### 6. Structural dead code triage

Fallow's current `dead-code --group-by package` output has 23 items. After walking each one against the codebase, the breakdown is:

- **1 genuine unused export.** `renderHook` in `apps/kitchensink-react/test/test-utils.tsx:49`. The re-export is never consumed; only `render` and `screen` are imported from this module elsewhere in the app. Worth deleting.
- **1 documented cycle already suppressed in source.** The `queryStore` ↔ `releasesStore` ↔ `getPerspectiveState` cycle, see section 1.
- **Configuration-shaped false positives that a better `.fallowrc.json` would silence:**
  - `apps/kitchensink-react/src/css/css.config.js` is flagged as unreachable, but it's an entry point consumed by a `paramour --config=./src/css/css.config.js` npm script. Knip lists it as an explicit entry.
  - `packages/@repo/e2e/src/setup/*.setup.ts` and `teardown/*.teardown.ts` are discovered by Playwright via `testMatch: /.*\.setup\.ts/` in `packages/@repo/e2e/src/index.ts`, not via `import`. Knip lists them as explicit entries; we'd add an equivalent entry glob to `.fallowrc.json`.
- **Dependency false positives from package-manifest string fields Fallow doesn't parse:**
  - `@sanity/browserslist-config` in `packages/core` and `packages/react`. Referenced as `"browserslist": "extends @sanity/browserslist-config"` in each `package.json`. Knip also misses this; knip.config.ts has explicit per-workspace `ignoreDependencies` entries for it.
  - `@sanity/prettier-config` at the repo root. Referenced as `"prettier": "@sanity/prettier-config"` in `package.json`. Knip resolves this via its built-in prettier plugin.
  - `@sanity/cli-v3` in `apps/kitchensink-react`. Referenced in npm scripts as `./node_modules/@sanity/cli-v3/bin/sanity`. Knip parses script strings.
  - `styled-components` in `apps/kitchensink-react`. A peer dep of `@sanity/ui`, not imported directly in the app. Knip recognizes peer-dep relationships.
- **Dependency false positives from build-time string references:**
  - `babel-plugin-react-compiler` in `packages/react`. Passed by name (as a string) to the shared Babel config in `packages/@repo/package.bundle/src/package.bundle.ts:17`. Both tools miss this path; knip doesn't flag it likely via other heuristics.
  - `react-compiler-runtime` in `packages/react` and `apps/kitchensink-react`. A runtime polyfill the React Compiler emits imports to at build time. Never directly imported by hand. Both tools miss this; knip suppresses it via `ignoreDependencies`.
- **Fallow analyzer bug: class-member reads behind `instanceof` type guards.** `ActionError.documentId` and `ActionError.transactionId` are flagged as unused but are read in `packages/core/src/document/documentStore.ts:354,359,360` and `packages/core/src/document/reducers.ts:491-492` after an `if (error instanceof ActionError)` narrowing. Fallow's class-member analysis doesn't appear to follow TS type-guard narrowing. Worth filing upstream.
- **Aliased re-export warnings that are intentional.** The 7 "duplicate exports" under `packages/core/src/comlink/` are all the same pattern: `actions/<name>.ts` exports a raw action, `comlinkControllerStore.ts` imports it aliased (`unbound<Name>`) and re-exports a store-bound version under the original name. Fallow flags the naming collision as potentially ambiguous to barrel consumers. In this codebase only the bound versions are public; the `actions/*` modules are internal. Either suppress per-line or rename the internal modules to drop the collision.

Net: 1 true finding out of 23. The rest is Fallow lacking the per-ecosystem plugins knip ships (browserslist, prettier, npm-scripts, peer deps, playwright) and one missed type-guard narrowing. All but the analyzer bug are one-time config additions to `.fallowrc.json`.

### 7. `fallow dupes` triage

Walked through a representative sample of the 27 clone groups from `fallow dupes --skip-local`. Findings:

- **Zero false positives.** Every clone I sampled was byte-identical (or near-identical) code in two locations. Fallow's suffix-array matching is conservative and doesn't hallucinate.
- **Production-code clones are all extract-worthy:**
  - `packages/core/src/utils/getEnv.ts:2-20` ↔ `packages/react/src/utils/getEnv.ts:2-20`, byte-identical 19 lines.
  - `useDocuments.ts:235-260` ↔ `usePaginatedDocuments.ts:255-280`, the `filterClause` `useMemo`. Differs only in one missing comment and a `documentTypes` vs `documentTypes?.length` dep.
  - `queryStore`/`usersStore` pair, already covered in section 2.
- **Test-file clones are real but lower priority.** Roughly 15+ of the 27 clone groups live in `.test.{ts,tsx}` files and are mock fixtures, `vi.mock` setup blocks, and parameterizable `expect.objectContaining(...)` assertions (e.g. `useDatasets.test.ts` vs `useProject.test.ts` is byte-identical aside from the symbol names under test). All real duplications, all extractable, but tests often favor readability over reuse so these are a judgment call, not an obvious fix.

Adoption concerns:

- **Test boilerplate dominates the surface.** If the duplication check ever becomes blocking in CI, we'll need either per-path thresholds or an `ignore` glob for `**/*.test.{ts,tsx}`. Otherwise any PR that adds a test mirroring an existing one trips the gate for a reason the team generally accepts.
- **Mode is a policy cliff.** Fallow's default mode is `mild`, not `strict` as we initially thought. On this repo `strict` and `mild` produce identical numbers (27 groups, 890 lines cross-dir), but `semantic` (renamed-variable matches) jumps to 125 groups / 3,337 lines. Both strict and semantic counts are "real," but the baselines they produce are very different. Pick one deliberately before wiring into a regression check.
- **Clone-family sections double-count the main listing.** `fallow dupes` prints individual groups and then re-groups them into per-file-pair "Clone families." Useful for reading, but any automation off this output needs to pick one surface, not both.
- **`--trace` line anchors can be off by a few.** The main listing is accurate; I hit one case where `--trace packages/core/src/query/queryStore.ts:138` failed and the correct anchor was `:144`. Minor, but worth knowing when copy-pasting from output.

Adoption-blocker assessment: none. The detection is reliable; the open questions are policy (tests in scope, which mode, what baseline), not correctness.

### 8. `fallow health --hotspots --ownership` triage

Audited the hotspot output against git (`git log --numstat` for churn and authors) and `rg` for fan-in on four representative files.

**Accurate, matches git exactly:**

| File                      | Fallow                          | Git / rg     | Match        |
| ------------------------- | ------------------------------- | ------------ | ------------ |
| `documentStore.ts`        | 7 commits, 268 churn, fan-in 6  | 7 / 268 / 6  | ✅           |
| `queryStore.ts`           | 6 commits, 62 churn, fan-in 8   | 6 / 62 / 8   | ✅           |
| `createActionBinder.ts`   | 6 commits, 251 churn, fan-in 26 | 6 / 251 / 26 | ✅           |
| `createSanityInstance.ts` | 3 commits, 61 churn, fan-in 66  | 3 / 61 / 64  | ≈ (within 2) |

Commit counts, churn, and fan-in all line up with raw git. The foundation of the hotspot score is reliable.

**Directionally correct, numerically opaque: author percentages.** Fallow's `top=carolina (76%)` doesn't match any obvious weighting:

| File                    | Fallow % | By churn lines | By commit count |
| ----------------------- | -------- | -------------- | --------------- |
| `documentStore.ts`      | 76%      | 81.3%          | 57.1% (4/7)     |
| `queryStore.ts`         | 51%      | 71.0%          | 50.0% (3/6)     |
| `createActionBinder.ts` | 77%      | 57.8%          | 66.7% (4/6)     |

The top-author identity is right in every case. The percentage appears to be a recency- or commit-weighted blend. Use it for triage ("this file has one dominant author") not for precise ownership claims.

**Opaque but plausible labels.** `bus=1 (at risk)`, `drift`, and trend markers (accelerating/stable/cooling) aren't explained in the output. They generally match intuition (queryStore is being actively edited and is flagged accelerating; authStore has settled and is flagged cooling), but the thresholds that drive the labels are not visible.

**Unverifiable without Fallow source:** the composite hotspot score (83.3, 50.3, etc.). Inputs check out, so the score is probably right too, but you can't reproduce it from first principles or ask Fallow to break down the contribution of each factor per file.

Concerns for adoption:

- **Percentages should not be quoted literally.** "Carolina wrote 76% of documentStore.ts" is not defensible from this output; by churn it's 81%, by commits 57%, Fallow's 76% is a third blend. Fine for triage, wrong for performance reviews.
- **Author names are `committer.name`, not GitHub handles.** No auto-linking to profiles. The `owner=` field does pick up CODEOWNERS correctly (`@sanity-io/sdk`), which is probably the right surface for review-assignment integrations.
- **Fan-in includes test files by default, filterable via `--production`.** `createActionBinder.ts`'s fan-in 26 is 22 production plus 4 tests. Running with `--production` excludes test/story/dev files from the analysis and drops the fan-in of representative files as expected (`sanityConfig.ts` 33→28, `useQuery.ts` 7→4, `packages/@repo/e2e/src/index.ts` 11→1). One quirk: the "above threshold" count went up in production mode (54→104 with fewer files analyzed), probably because `--production` also reports type-only dependencies that don't surface otherwise. Worth a targeted check before relying on the exact number. The `fallow:hotspots` script in this PR defaults to `--production` for the reviewer-triage use case.
- **No score breakdown.** You can validate inputs and the ranking order, but you can't ask Fallow to show which factor pushed a specific file up the list.

Adoption-blocker assessment: none. The signal is useful, raw inputs are accurate, and the opacity is around interpretation (how to read the percentages and labels) rather than correctness. Use this as "where should reviewers look hardest on this PR," not as formal ownership data.

### 9. `fallow audit` and baseline behavior

Ran the pieces CI will actually enforce, end to end. Created a scratch branch, committed a single file with three synthetic regressions (a byte-for-byte copy of `getEnv.ts`, a deeply nested `classify` function, and the file itself unreachable from any entry point), then exercised `fallow audit` against `origin/main`.

**Audit catches regressions correctly.** With no baselines:

```
✗ dead code: 9 issues · complexity: 2 findings · duplication: 1 clone group · 7 changed files (0.63s)
```

Breakdown: `__fallow_regression__.ts` flagged unreachable; duplication pinpointed to `getEnv.ts:9-20 ↔ __fallow_regression__.ts:8-16` (exact line anchors); `classify` flagged CRITICAL at 21 cyclomatic / 86 cognitive / CRAP 462; `getEnvCopy` flagged HIGH at CRAP 72 (above the 30 default threshold). Exit 1. The 9 dead-code items include the 8 pre-existing dep false positives we already know about.

**Baselines work and suppress correctly.** `fallow audit` rejects the general `--baseline` flag; it takes three separate arguments: `--dead-code-baseline`, `--health-baseline`, `--dupes-baseline` (the underlying formats differ). With all three baselines set on the same regression, dead-code drops from 9 to 1:

```
✗ dead code: 1 issue · complexity: 2 findings · duplication: 1 clone group · 7 changed files (0.54s)
```

The 8 pre-existing dep false positives surfaced via `package.json` changes (3 unused deps + 5 unused devDeps) were correctly suppressed by the dead-code baseline, leaving only the new synthetic regression file. The dupes and health baselines were loaded but had nothing to match against because audit scopes to changed files and none of the pre-existing clones or complexity findings live in the diff. That's the design: baselines filter findings that are within the audit scope but were already known. Adoption story holds: commit baselines once, CI gates future regressions without litigating the existing backlog.

**Baseline files are small, deterministic, and reviewable.**

| File             | Size              | Contents                                                                                      | Stability                      |
| ---------------- | ----------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| `dead-code.json` | 2.3 KB, 47 lines  | symbolic: file paths and identifier names                                                     | byte-identical across two runs |
| `health.json`    | 5.6 KB, 230 lines | per-file severity bucket counts (`crap_critical: 1`, etc.); no line numbers or function names | byte-identical across two runs |
| `dupes.json`     | 3.5 KB, 30 lines  | line-anchored: `file:startLine-endLine\|file:startLine-endLine` per clone                     | byte-identical across two runs |

Determinism verified by running each `--save-baseline` command twice and diffing. All three produced identical output.

**Line-anchored dupes baselines are the real concern.** Because each clone is keyed on absolute line numbers, any edit that shifts lines of a baselined clone invalidates the entry and the clone re-surfaces as "new" duplication. Adding an import, inserting a line of logic, or reformatting above a baselined block will trip the audit. Options: regenerate baselines as part of CI's merge-to-main job, accept that some baseline churn is normal, or (best) fix the clones so the baseline can shrink rather than churn.

**Health baseline has a misleading warning.** Running audit with `--health-baseline` printed `Warning: health baseline has 57 entries but matched 0 current findings. Your paths may have changed, or the baseline was saved on a different machine.` This is false alarm: the audit scope (changed files vs main) just didn't happen to include any of the baselined files. The warning suggests something is wrong when nothing is. Worth filing upstream; CI log will look noisier than it should on clean PRs.

**Output format note (workflow bug fix).** The workflow in this PR originally used `pnpm fallow audit --format annotations`, but `annotations` is not a valid format. Valid values: `human, json, sarif, compact, markdown, codeclimate, badge`. Fixed in the committed workflow to use `--format markdown` piped to `$GITHUB_STEP_SUMMARY`, which renders the audit output in GitHub's step-summary surface. For inline file-level annotations (like PR review comments), `--format sarif` + the `github/codeql-action/upload-sarif` action would be the route; deferred because markdown summaries are lower-setup and already visible to reviewers.

### 10. Pre-commit and pre-push hook recommendation

The existing pre-commit setup is `husky` → `lint-staged` → `eslint --fix` + `prettier --write`, scoped to the files you staged. It's fast because it never runs on files you didn't touch. The question is whether any Fallow command belongs in that chain.

Recommendation: **none of them**. Use CI (already set up) for PR-scoped checks, and reach for a manual script or optional `pre-push` hook if a local gate is wanted later.

Two reasons Fallow doesn't fit pre-commit:

1. **Every Fallow analysis is whole-repo by design.** Dead-code needs the full import graph, dupes needs every file's token stream, circular needs the resolved module graph. You can't narrow them to staged files without breaking the analysis, so adding Fallow to pre-commit means running the full pass on every `git commit`. That's 1-2s today, noticeable on small commits and compounding during rebases.
2. **False-positive tolerance on a commit hook is near zero.** The moment a hook blocks a commit for a reason the author believes is wrong, people start running `git commit --no-verify` reflexively and the hook is worse than nothing. Fallow's `dead-code` has the real false positives from section 6 (browserslist, npm scripts, peer deps, Babel plugin strings, the `instanceof` analyzer gap); `dupes` needs a policy decision about test files before it could gate. Neither is commit-hook material yet.

Per command:

| Command               | Add to pre-commit? | Why                                                                                         |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `dead-code`           | No                 | Whole-repo; known false positives; redundant with knip                                      |
| `circular`            | No                 | ESLint `import/no-cycle: error` already blocks new cycles on staged files via `lint-staged` |
| `dupes`               | No                 | Not a commit-time concern; findings are design work, not mechanical fixes                   |
| `health` / `hotspots` | No                 | Reporting, not a gate                                                                       |
| `audit`               | No                 | Needs a base ref; designed for PR diffs, not `HEAD`                                         |
| `--summary`           | No                 | Informational; CI already surfaces this                                                     |

**Where Fallow can run locally, if anywhere:** `pre-push`, not `pre-commit`. It fires once per push (cost amortizes), has a base ref available (`@{upstream}`), and `fallow audit --base origin/main` produces diff-scoped output there. The [.github/workflows/fallow.yml](.github/workflows/fallow.yml) job already runs the same command on every PR and renders to the step summary, so a local `pre-push` duplicates CI; worth considering only if we find CI feedback is arriving too late.

**Zero-friction alternative that doesn't touch hooks:** the existing `pnpm fallow:audit` script. Someone running it before opening a PR gets the same signal without any per-commit cost. That's the shape I'd leave it in unless we have a specific reason to move a check earlier.

## Speed

Sub-second per analysis on this repo. Full all-in-one pass with summary output: 1.9 seconds. Knip's `pnpm depcheck` takes around 5 seconds. Fast enough that running it on every PR is essentially free. Running it on every commit would also be cheap in wall-clock terms, though section 10 explains why that's still the wrong place for it.

## False positives we hit

- `package.config.ts` and `package.bundle.ts` (the `@sanity/pkg-utils` build conventions) are not auto-detected. Fixed with a four-line `entry` array in [.fallowrc.json](.fallowrc.json).
- Package-manifest string fields: `"browserslist": "extends ..."`, `"prettier": "..."`, and npm `scripts` that reference `./node_modules/<pkg>/bin/*`. Knip ships plugins for each; Fallow doesn't, so it flags the packages as unused. Resolvable with per-workspace `ignoreDependencies` in `.fallowrc.json`, but porting knip's list is a requirement for any adoption PR.
- Build-time Babel/Vite plugins referenced by string name (`babel-plugin-react-compiler`, `react-compiler-runtime`). Same story.
- Playwright `testMatch`-discovered files in `packages/@repo/e2e/src/setup/`, `teardown/`. Needs an explicit entry glob in `.fallowrc.json`.
- Class members read behind `instanceof` type guards (`ActionError.documentId`, `ActionError.transactionId`). This looks like a Fallow analyzer gap worth reporting upstream rather than configuring around.
- `fallow migrate` does not read [knip.config.ts](knip.config.ts) (TS file with dynamic logic). It only reads `.knip.json`. We hand-wrote the minimal config above.

Net of 23 dead-code findings: 1 true positive (`renderHook` export), 1 known-and-documented cycle, 1 analyzer gap, and 20 items that are Fallow missing plugin parity with knip and will need the knip suppressions ported into `.fallowrc.json` before adoption.

## What we are NOT testing in this eval

- Architecture boundaries (`fallow init` boundary presets, `boundaries` config). Plausibly useful for enforcing layering rules (e.g. preventing `core` from importing anything DOM-specific), but we did not enable it.
- Fallow Runtime (paid tier: real production coverage). Out of scope.
- Auto-fix (`fallow fix`). Tested neither in dry-run nor for-real.
- The MCP server and Agent Skill that ship in `node_modules/fallow/`. Worth wiring into Cursor in a follow-up if we keep Fallow.
- `fallow init --hooks`. The evaluation of what belongs in a commit hook is in section 10; `fallow init --hooks` itself was not run.

## Recommendation

**Adopt Fallow alongside knip for what knip doesn't cover: duplication, complexity, hotspots, ranked refactor targets, and priority-weighted cycle detection. Keep knip as the dead-code and unused-dependency gate.**

This is what the audits in sections 6-9 add up to. Rolled up from the comparison table in "How Fallow compares to our existing tooling":

| Surface                                           | Verdict                                                                                                                                                                                           | Source        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Dead code, unused exports, unused deps            | Keep knip. Fallow is 1 true finding out of 23 on this repo until plugin parity lands.                                                                                                             | Section 6     |
| Circular deps                                     | Keep ESLint `import/no-cycle: error` as the author-time gate. Use Fallow's ranking to prioritize the three suppressed imports we already have.                                                    | Section 1     |
| Duplication                                       | Adopt Fallow. Zero false positives in triage; no alternative in the toolchain.                                                                                                                    | Section 7     |
| Health (complexity / cognitive / maintainability) | Adopt Fallow. Net new signal; directly targets the "AI keeps adding `if` branches" concern.                                                                                                       | Sections 4, 5 |
| Hotspots and refactor targets                     | Adopt Fallow. Inputs verified against git; derived metrics opaque but useful for review triage.                                                                                                   | Section 8     |
| PR-scoped audit + baselines                       | Adopt Fallow for the dup/health/cycle surface. Audit verified end-to-end: catches synthetic regressions, baselines suppress pre-existing findings correctly. Skip `audit` for dead-code and deps. | Section 9     |
| Pre-commit / pre-push hooks                       | Don't add any.                                                                                                                                                                                    | Section 10    |

Full replacement of knip was considered and not recommended. It would mean porting knip's `ignoreDependencies` and entry globs (browserslist, prettier, npm-script, peer-dep, playwright) into `.fallowrc.json` by hand, then accepting that those suppressions are now static. If `@sanity/ui` were removed from kitchensink tomorrow, knip would surface `styled-components` as unused automatically; Fallow wouldn't. The maintenance is small, the detection regression isn't. Revisit once Fallow ships the missing plugins upstream.

Concrete adoption steps:

1. **Make [.github/workflows/fallow.yml](.github/workflows/fallow.yml) blocking for the dup/health/cycle surface.** Remove `continue-on-error: true` once the baselines in step 2 are committed. Leave the `Depcheck` workflow alone.
2. **Commit three baseline files before anything becomes blocking.** Audit uses separate baselines per sub-analysis (`--dead-code-baseline`, `--health-baseline`, `--dupes-baseline`). 54 complexity-above-threshold functions, 27 cross-dir clone groups, and the 20 dead-code plugin-parity gaps from section 6 can't fail PRs on day one. Commit `fallow-baselines/{dead-code,health,dupes}.json` so CI fails on regressions only. Baselines are small (2-6 KB each), byte-reproducible across runs, and reviewable as JSON. See section 9.
3. **Dupes baseline is line-anchored, expect some churn.** Each clone is keyed on `file:startLine-endLine`, so any edit that shifts lines above a baselined clone will re-surface it as "new" duplication. Plan to regenerate the dupes baseline as part of the merge-to-main flow, or treat a small steady-state churn as acceptable. Section 9 for the format.
4. **Pick a dupes mode and scope before turning it on.** Default is `mild`, and on this repo `mild` and `strict` produce the same 27 cross-dir clone groups / 890 lines. `semantic` jumps to 125 / 3,337. Stick with the default unless we want semantic matches. Add an ignore glob for `**/*.test.{ts,tsx}` if test-file noise dominates the signal once it's live. See section 7.
5. **The `fallow:hotspots` script already defaults to `--production`.** Tests and stories are excluded from fan-in and hotspot ranking, which is the "blast radius in production code" framing reviewers typically want (section 8). One quirk to be aware of when interpreting: the threshold-violation count goes up slightly in production mode, likely because `--production` also reports type-only dependency findings. Don't quote that number as an absolute; it's a different surface than the default mode.
6. **Use section 5's targets list as a refactor backlog.** `queryStore.ts`'s circular dependency is the top pick and would let us delete three `eslint-disable import/no-cycle` comments and the lazy-binding workaround together.
7. **Caveats when consuming hotspot output.** Raw inputs (commits, churn, fan-in) match git exactly; author percentages and `bus=1` labels are directionally correct but shouldn't be quoted literally. See section 8.
8. **Defer architecture boundaries, MCP / Agent Skill wiring, and Fallow Runtime.** Each is worth its own decision after this one lands.

Rejection path: close this PR, `pnpm remove fallow`, delete [.fallowrc.json](.fallowrc.json) and [.github/workflows/fallow.yml](.github/workflows/fallow.yml). Zero cost, zero change.

Independent of the Fallow decision: knip's `ignoreDependencies` list is worth auditing. Several entries looked like they may no longer be needed.

## What's in this PR

- `fallow` added as a pinned devDependency with five scripts: `fallow` (passthrough), `fallow:summary`, `fallow:audit`, `fallow:hotspots` (with `--production` so tests are excluded from fan-in), and `fallow:targets` (ranked refactor backlog)
- [.fallowrc.json](.fallowrc.json), 22 lines, registers the `package.config.ts` / `package.bundle.ts` conventions and disables the playwright plugin in the kitchensink workspace
- [.github/workflows/fallow.yml](.github/workflows/fallow.yml), non-blocking (`continue-on-error: true`), renders the audit and hotspot output into the job's step summary
- This document
- `.fallow/` added to [.gitignore](.gitignore) for Fallow's local cache

Knip, the `Depcheck` workflow, and the `pnpm depcheck` script are unchanged.
