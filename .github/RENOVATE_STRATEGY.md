# Renovate Dependency Management Strategy

## Overview

This document explains our Renovate configuration and how it helps manage dependencies in our public SDK.

## Key Principles

1. **Automerge by default** - CI acts as our safety net
2. **Keep Option A** - Production dependency updates trigger patch releases via `fix(deps):` commits
3. **Manual review only for high-risk changes** - Major updates, peer dependencies, TypeScript majors
4. **Auto-approval workflow** - GitHub Action automatically approves safe Renovate PRs to satisfy branch protection

## Branch Protection & Auto-Approval

Our branch protection rules require **at least 1 approval** before merging. To enable automerge for Renovate PRs, we use a GitHub Action (`.github/workflows/renovate-auto-approve.yml`) that:

1. Waits for all CI checks to pass (build, test, lint, typecheck)
2. Skips auto-approval for high-risk PRs (labeled `needs-review`, `major-update`, or `breaking-change`)
3. Automatically approves safe PRs (devDependencies, production patches/minors)
4. Allows Renovate's automerge to proceed

This ensures:

- ✅ Branch protection remains enforced (CI must pass)
- ✅ Low-risk updates automerge without human intervention
- ✅ High-risk updates still require manual review and approval

## What Automerges (No Human Intervention Needed)

### ✅ DevDependencies

- **Non-major** (patch/minor): Automerge after 3 days
- **Major**: Automerge after 7 days (except TypeScript)
- **Rationale**: Internal tooling changes don't affect published SDK

### ✅ Production Dependencies (patch/minor)

- **Automerge after**: 7 days stability period
- **Triggers**: `fix(deps):` commit → Release Please creates patch release
- **Rationale**: Bug fixes and backwards-compatible improvements should reach users quickly

### ✅ Tooling Groups

- **ESLint ecosystem**: Automerge after 3 days
- **TypeScript tooling** (@sanity/pkg-utils, @sanity/tsdoc): Automerge after 5 days
- **App dependencies**: Automerge after 2 days

## What Requires Manual Approval

### ⚠️ Production Dependencies (major)

- **Why**: Likely contains breaking changes
- **Process**: Requires approval in Dependency Dashboard
- **Commit type**: `chore(deps):` (doesn't auto-trigger release)
- **Action**: Review changelog, test thoroughly, decide if SDK needs major/minor bump

### ⚠️ PeerDependencies

- **Why**: Affects consumer compatibility (e.g., React version requirements)
- **Process**: Requires approval in Dependency Dashboard
- **Commit type**: `chore(peer-deps):`
- **Action**: Test with minimum and maximum peer dep versions

### ⚠️ TypeScript (major)

- **Why**: Breaking changes in type system can affect consumers
- **Process**: Requires approval in Dependency Dashboard
- **Commit type**: `chore(tooling):`
- **Action**: Check if types in public API are affected

### ⚠️ High Severity Security Vulnerabilities

- **Why**: Need to assess impact and urgency
- **Process**: PR created immediately (no stability delay)
- **Action**: Review, test, merge ASAP

## Expected Weekly Flow

### Monday - Thursday

- Renovate creates PRs in the early morning (before 5am)
- PRs wait for stability period (2-7 days depending on type)
- CI runs on all PRs (build, test, lint, typecheck)
- PRs automerge when stability period passes + CI green

### Friday

- Most PRs from early week have automerged
- Review any major update approvals in [Dependency Dashboard](../../issues)
- Check for any failed automerges

### Release Cadence

- **Ideal**: 1-2 releases per week (as dependency updates automerge)
- **Process**: Review and merge Release Please PR when ready
- **Emergency**: Security fixes can be merged immediately

## Monitoring & Maintenance

### Dependency Dashboard

Check `https://github.com/sanity-io/sdk/issues` for the **Dependency Dashboard** issue created by Renovate.

It shows:

- ✅ **Open PRs**: Currently pending updates
- ⏳ **Rate Limited**: Updates waiting for stability period
- 🔒 **Pending Approval**: Major updates needing your review
- ⚠️ **Errors**: Failed PRs needing investigation

### Weekly Checklist

- [ ] Check Dependency Dashboard for pending approvals
- [ ] Review any failed automerge PRs
- [ ] Merge Release Please PR if ready
- [ ] Check if any major updates need planning

### Pre-Release Checklist

Before merging a Release Please PR:

```bash
# Review dependency changes since last release
git log v2.4.0..HEAD --oneline --grep="fix(deps)"

# Run full test suite
pnpm run all

# Run E2E tests
pnpm run test:e2e

# Test in kitchensink app
pnpm run dev:kitchensink

# Check bundle size
pnpm run build:bundle
```

## Configuration Summary

| Dependency Type  | Update Type | Auto/Manual | Stability Days | Commit Type        | Triggers Release? |
| ---------------- | ----------- | ----------- | -------------- | ------------------ | ----------------- |
| devDependencies  | patch/minor | ✅ Auto     | 3 days         | `chore(dev-deps)`  | No                |
| devDependencies  | major       | ✅ Auto     | 7 days         | `chore(dev-deps)`  | No                |
| TypeScript       | major       | ⚠️ Manual   | 14 days        | `chore(tooling)`   | No                |
| Production deps  | patch/minor | ✅ Auto     | 7 days         | `fix(deps)`        | **Yes - Patch**   |
| Production deps  | major       | ⚠️ Manual   | 14 days        | `chore(deps)`      | No                |
| peerDependencies | any         | ⚠️ Manual   | 7 days         | `chore(peer-deps)` | No                |
| Security (high)  | any         | ⚠️ Manual   | 0 days         | depends            | varies            |

## Troubleshooting

### PR Won't Automerge

1. Check CI status - all checks must pass
2. Check stability period - may still be waiting (see labels for `minimumReleaseAge`)
3. Check if PR has been approved - branch protection requires 1 approval
   - Low-risk PRs should auto-approve via `.github/workflows/renovate-auto-approve.yml`
   - High-risk PRs (labeled `needs-review`, `major-update`) require manual approval
4. Check if it's marked as requiring manual approval (major/peer deps)
5. Check Renovate automerge is enabled for that PR type in `renovate.json`

### Too Many Releases

If you're getting more releases than desired, consider:

- Grouping more dependencies together
- Changing non-critical production deps to `chore:` commits

### Not Enough Releases

If updates are accumulating without releases:

- Check if automerge is working (PRs should merge automatically)
- Check if Release Please PR is open and waiting for merge
- Consider reducing stability days for faster merges

## Making Changes

To adjust this strategy:

1. Edit `.github/renovate.json`
2. Test changes by running Renovate in dry-run mode
3. Monitor Dependency Dashboard for a week after changes
4. Adjust based on actual PR volume and team capacity

## Questions?

- **"Why 7 days for production deps?"** - Catches bugs reported by early adopters before we ship to our users
- **"Why automerge devDependencies major?"** - Internal tooling breaking changes are caught by CI
- **"Why require approval for peer deps?"** - Changing React version requirements affects all consumers
