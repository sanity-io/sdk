---
paths:
  - 'packages/**/src/**/*.ts'
  - 'packages/**/src/**/*.tsx'
  - 'apps/**/src/**/*.ts'
  - 'apps/**/src/**/*.tsx'
---

# Fallow audit

Every pull request runs [`.github/workflows/fallow.yml`](../../.github/workflows/fallow.yml), which fails on findings the branch introduced. Run the same check before reporting work as complete:

```bash
pnpm fallow audit
```

The base is resolved from the branch's upstream, or from `origin/HEAD` when there is no upstream. Pass `--base origin/<branch>` on a stacked branch. The audit reads the working tree, so uncommitted edits count.

## What fails the audit

Findings in the files the branch touched, across four analyses:

- **Dead code.** New files, exports, or dependencies nothing reaches. An export added now for a follow-up change counts as dead today.
- **Complexity.** Functions at or above a CRAP score of 30.
- **Duplication.** Blocks cloned from elsewhere in the repo.
- **Styling.** Unreachable CSS.

Only findings the branch introduced gate the build. Pre-existing findings in the same files are reported but do not fail, and the files under `fallow-baselines/` suppress the known backlog.

## Fixing a failure

Fix the finding first: delete the unreachable code or wire it to an entry point, split the complex function, extract the clone into a shared helper.

If the finding looks wrong, confirm it before working around it:

```bash
pnpm fallow dead-code --trace path/to/file.ts:exportName  # what reaches this export
pnpm fallow dead-code --trace-dependency some-package     # what imports this dependency
pnpm fallow explain unused-export                         # what a rule means
```

Only then suppress it, with a reason after a `--` separator:

```ts
// fallow-ignore-next-line unused-export -- re-exported for consumers, no internal caller
```

Use `fallow-ignore-file <rule>` at the top of a file for a whole-file suppression. The `--` matters: text placed directly after the rule name without it is parsed as another rule name and the suppression silently does nothing. Rule names match the ones `fallow explain` prints, such as `unused-export`, `unused-file`, `complexity`, and `code-duplication`.

## Do not regenerate baselines to get green

`pnpm fallow:baseline` overwrites `fallow-baselines/*.json`. Running it to clear a failing audit hides the regression rather than fixing it. Regenerating is a deliberate maintenance task; the cases where it is correct are listed in [`fallow-baselines/README.md`](../../fallow-baselines/README.md).
