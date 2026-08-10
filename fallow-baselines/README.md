# Fallow baselines

These three JSON files hold findings the [`Fallow`](../.github/workflows/fallow.yml) CI workflow should stay quiet about, so a pull request is judged on what it introduced rather than on the whole pre-existing backlog.

Two layers decide whether a pull request fails, and the difference matters when you regenerate:

1. **These baselines.** Anything listed is suppressed outright, whether or not the branch introduced it.
2. **`--gate new-only`**, the `fallow audit` default. Of whatever is left, it fails only on findings attributed to the branch, comparing against a snapshot of the base ref that is rebuilt from git on every run.

A baseline that has drifted out of date is harmless: the finding falls through to layer 2, which still recognises it as pre-existing, so reports get noisier but builds stay green. A baseline regenerated at the wrong moment is not harmless, because layer 1 wins and a real regression is silenced for good.

| File             | Suppresses                                                                        |
| ---------------- | --------------------------------------------------------------------------------- |
| `dead-code.json` | Files, exports, and class members already unused, plus existing duplicate exports |
| `health.json`    | Functions already over the complexity / CRAP thresholds                           |
| `dupes.json`     | Clone groups already present in the repo                                          |

Paths are referenced from [`.fallowrc.json`](../.fallowrc.json) under the `audit` block, so `pnpm fallow audit` and the CI workflow pick them up automatically.

## Config suppressions vs baselines

The baselines hold backlog: findings we intend to burn down. Permanent false positives go in the `ignoreDependencies` array in [`.fallowrc.json`](../.fallowrc.json) instead, so the baselines don't accumulate entries that can never be resolved. No dependency findings are baselined today.

Seven packages are listed there:

| Package                       | Actually used in                                                               |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `@sanity/browserslist-config` | `browserslist` field of the `packages/core` and `packages/react` manifests     |
| `@sanity/tsconfig`            | `extends` in `packages/@repo/tsconfig/base.json`                               |
| `babel-plugin-react-compiler` | `reactCompilerPreset` in `packages/@repo/package.bundle/src/package.bundle.ts` |
| `react-compiler-runtime`      | Injected into React Compiler output at build time                              |
| `@google-cloud/storage`       | `scripts/uploadBundles.mts`                                                    |
| `read-package-up`             | `scripts/uploadBundles.mts`                                                    |
| `zx`                          | `scripts/release-branch.mts`, `scripts/release-rc.mts`                         |

The first four are referenced from config rather than imported, so Fallow cannot see the usage at all. The last three are imported normally, but only from `scripts/`, which Fallow classifies as production code and so reports as `dev-dependencies-in-production`.

Scoping an `overrides` entry to `scripts/**` does not suppress that, because Fallow attributes the finding to the root `package.json` rather than to the importing script. Setting `rules: {"dev-dependencies-in-production": "off"}` does work, but it would also stop Fallow catching a devDependency imported from `packages/core` or `packages/react`, which breaks for consumers who never install devDependencies. Naming the three packages keeps that check alive.

[`knip.config.ts`](../knip.config.ts) carries per-workspace `ignoreDependencies` for some of the same packages. Keep the two roughly in sync.

## Regenerating

Run from the repo root:

```bash
pnpm fallow:baseline
```

That runs `dead-code --save-baseline`, `health --save-baseline`, and `dupes --save-baseline`, formats the output, and overwrites the three files. Commit the result.

Check that `pnpm fallow audit` is green before you run it. Regeneration records whatever it finds, so regenerating with an unaddressed regression in the tree writes that regression into the baseline and suppresses it from then on.

## When to regenerate

- **Dupes baseline.** Each entry is keyed on absolute line numbers (`file:startLine-endLine`). Inserting an import or refactoring above a baselined clone shifts the line numbers and the clone re-surfaces as "new" duplication on the next audit. Regenerate when this gets noisy. The dead-code and health baselines are symbolic and don't have this problem.
- **After fixing existing findings.** If a PR removes dead code, breaks a clone group, or refactors a complex function, regenerate the corresponding baseline so it shrinks rather than masks the fix.
- **After upgrading Fallow.** New analyzer versions can change what's reported (more accurate detection, new false positives, occasional analyzer fixes). Regenerate so the diff doesn't show up as a regression.

## When _not_ to regenerate

- To make a failing audit pass. It does work, and that is exactly the danger: baselines suppress findings whether or not the branch introduced them, so regenerating buries the regression rather than fixing it. If audit is failing, the branch introduced a new finding. Fix it, suppress it inline (`// fallow-ignore-next-line ...`), or update the audit thresholds in [`.fallowrc.json`](../.fallowrc.json).
