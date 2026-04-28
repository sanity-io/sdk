# Fallow baselines

These three JSON files are the inputs that let the [`Fallow`](../.github/workflows/fallow.yml) CI workflow fail PRs only on _new_ findings instead of on the whole pre-existing backlog.

| File             | Suppresses                                                     |
| ---------------- | -------------------------------------------------------------- |
| `dead-code.json` | Files, exports, dependencies, and class members already unused |
| `health.json`    | Functions already over the complexity / CRAP thresholds        |
| `dupes.json`     | Clone groups already present in the repo                       |

Paths are referenced from [`.fallowrc.json`](../.fallowrc.json) under the `audit` block, so `pnpm fallow audit` and the CI workflow pick them up automatically.

## Regenerating

Run from the repo root:

```bash
pnpm fallow:baseline
```

That runs `dead-code --save-baseline`, `health --save-baseline`, and `dupes --save-baseline` and overwrites the three files. Commit the result.

## When to regenerate

- **Dupes baseline.** Each entry is keyed on absolute line numbers (`file:startLine-endLine`). Inserting an import or refactoring above a baselined clone shifts the line numbers and the clone re-surfaces as "new" duplication on the next audit. Regenerate when this gets noisy. The dead-code and health baselines are symbolic and don't have this problem.
- **After fixing existing findings.** If a PR removes dead code, breaks a clone group, or refactors a complex function, regenerate the corresponding baseline so it shrinks rather than masks the fix.
- **After upgrading Fallow.** New analyzer versions can change what's reported (more accurate detection, new false positives, occasional analyzer fixes). Regenerate so the diff doesn't show up as a regression.

## When _not_ to regenerate

- To make a failing audit pass. If audit is failing, it's because the PR introduced a new finding. Fix the finding, suppress it inline (`// fallow-ignore-next-line ...`), or update the audit thresholds in [`.fallowrc.json`](../.fallowrc.json). Regenerating the baseline to silence a real regression defeats the purpose of the gate.
