# Renovate dependency management strategy

This doc explains how Renovate is configured for this repo and how we're expected to interact with it.

For Renovate's own docs, see [Dependency Dashboard](https://docs.renovatebot.com/key-concepts/dashboard/) and [Upgrade best practices](https://docs.renovatebot.com/upgrade-best-practices/).

## Key principles

1. **Automerge by default**, with CI as the safety net.
2. **Production dep updates trigger a patch release** via `fix(deps)` commits, aligning with release-please.
3. **Manual review for high-risk changes**: production majors, peer deps, TypeScript majors.
4. **14-day release age for external deps, 3 days for Sanity-maintained**, to balance supply-chain safety against keeping current.

## Where to look

- Config: [`.github/renovate.json`](renovate.json)
- Running state: [Dependency Dashboard issue](../../issues/9)
- Auto-approve workflow: [`.github/workflows/renovate-auto-approve.yml`](workflows/renovate-auto-approve.yml)

## Reading the dashboard

The dashboard groups pending work into sections. Only a couple of them need regular human input.

### Pending Approval (needs you)

Renovate won't create these PRs until you tick a checkbox. Matches rules with `dependencyDashboardApproval: true`: production major deps, peer deps, and TypeScript majors. Ticking the box only opens the PR; you can still review, reject, or ask for changes.

### Awaiting Schedule (automatic)

Renovate will create these PRs at its next scheduled run (currently `before 5am` UTC daily) or once `minimumReleaseAge` has elapsed. No action required.

### Rate-Limited (automatic, but capped)

We set `prConcurrentLimit: 10`. Once 10 Renovate PRs are open, additional updates queue here. If this section grows long, drain it by merging or reviewing open Renovate PRs.

### Pending Status Checks (automatic)

Renovate has pushed a branch and CI is running. Once CI reports a non-pending status, the PR opens. We use `prCreation: "not-pending"` so open PRs always have a CI verdict attached.

### PR Closed (Blocked) (needs you)

A previous PR was closed without merging, and Renovate won't try again unless you tick the box. Only re-tick if you actually want to retry the upgrade.

### Detected Dependencies (reference only)

Inventory of everything Renovate tracks. No action required.

### Repository problems / Errored (investigate)

Neither usually appears. If one does, check the Renovate run logs linked from the top of the dashboard issue.

## Automerge policy

| Dependency type                                                           | Update type    | Auto/Manual | Release age | Commit type        | Triggers release?                                                   |
| ------------------------------------------------------------------------- | -------------- | ----------- | ----------- | ------------------ | ------------------------------------------------------------------- |
| devDependencies                                                           | patch/minor    | Auto        | 14 days     | `chore(dev-deps)`  | No                                                                  |
| devDependencies (except TypeScript)                                       | major          | Auto        | 14 days     | `chore(dev-deps)`  | No                                                                  |
| TypeScript                                                                | major          | Manual      | 14 days     | `chore(tooling)`   | No                                                                  |
| Production deps (in `packages/core`, `packages/react`)                    | patch/minor    | Auto        | 14 days     | `fix(deps)`        | **Yes, patch**                                                      |
| Production deps (in `packages/core`, `packages/react`)                    | major          | Manual      | 14 days     | `fix(deps)`        | **Yes, patch** (override to `feat!` at squash for breaking changes) |
| Peer deps                                                                 | any            | Manual      | 14 days     | `chore(peer-deps)` | No                                                                  |
| App deps (`apps/**`)                                                      | any            | Auto        | 14 days     | `chore(apps)`      | No                                                                  |
| **Sanity-maintained packages** (`@sanity/*`, `sanity`, `groq`, `groq-js`) | inherits above | inherits    | **3 days**  | inherits           | inherits                                                            |
| High-severity security (any)                                              | any            | Manual      | 0 days      | varies             | varies                                                              |

### Why 14 days for external packages

Renovate recommends a 14-day [`minimumReleaseAge`](https://docs.renovatebot.com/configuration-options/#minimumreleaseage) for any dep you automerge from third parties. The delay gives npm and upstream maintainers time to pull malicious or broken releases before they reach our CI. Supply-chain attacks in the JS ecosystem typically get spotted within that window.

For packages Sanity publishes, we have direct visibility into the release process, so 3 days is enough to catch obvious mistakes without slowing our own work.

## Commit messages and releases

Our rules align Renovate's commit types with [release-please](../release-please-config.json):

- `fix(deps)`: triggers a patch release. Used for any production dep update in `packages/core` or `packages/react`.
- `chore(*)`: hidden from the changelog. Used for dev deps, tooling, peer deps, apps.

If a production major dep actually breaks our public API, override the commit type at squash time from `fix(deps)` to `feat(deps)!` or add a `BREAKING CHANGE:` footer so release-please produces a minor/major release.

## Auto-approval workflow

Our branch protection requires at least 1 approval before merging. The auto-approve workflow (`.github/workflows/renovate-auto-approve.yml`):

1. Waits for CI checks (build, test, lint, typecheck).
2. Skips auto-approval for PRs labeled `needs-review`, `major-update`, or `breaking-change`.
3. Auto-approves the rest so Renovate's automerge can proceed.

**Known gap**: the workflow uses `GITHUB_TOKEN`, whose approvals don't count toward CODEOWNERS or team-approval rules. Tracked in [SDK-1272](https://linear.app/sanity/issue/SDK-1272), where we plan to switch to `squiggler-app` so approvals come from a trusted team-identity bot.

## Expected weekly flow

**Monday-Thursday**: Renovate opens PRs in the early morning (before 5am UTC). CI runs. PRs automerge as release age elapses and CI goes green.

**Friday**: Most PRs from early in the week have merged. Review pending approvals on the Dependency Dashboard. Check for failed automerges.

**Release cadence**: 1-2 releases per week via release-please, driven by `fix(deps)` commits merging in.

## Monitoring & maintenance

### Weekly checklist

- Check the [Dependency Dashboard](../../issues/9) for pending approvals.
- Review any failed automerge PRs.
- Merge the release-please PR if ready.
- Note any major updates that need planning.

### Pre-release checklist

Before merging a release-please PR:

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

## Troubleshooting

### A Renovate PR's lockfile looks broken

Our config uses `postUpdateOptions: ["pnpmDedupe"]` and pins `constraints.pnpm` to match the repo's `packageManager` field, which should prevent most lockfile issues. If one slips through, run `pnpm install` locally, commit the result, and push to the Renovate branch. Renovate won't overwrite manual commits.

### A PR won't automerge

1. Check CI status: all checks must pass.
2. Check the release-age label: might still be waiting.
3. Check the PR has been approved: branch protection requires 1 approval.
4. Check it's not labeled `needs-review`, `major-update`, or `breaking-change`.
5. Check `renovate.json` confirms automerge is enabled for that PR type.

### I want to retry a closed Renovate PR

Find it in "PR Closed (Blocked)" on the dashboard and tick the box.

### The rate-limited queue is huge

Either merge/close open Renovate PRs to drain the queue, or temporarily bump `prConcurrentLimit` in `renovate.json` and revert once drained.

### I'm bumping the repo's pnpm version

When `packageManager` in `package.json` changes, update `constraints.pnpm` in `.github/renovate.json` to match. Otherwise Renovate's lockfile output will drift from local and CI.

## Making changes

1. Edit `.github/renovate.json` (the `$schema` key provides editor validation).
2. Open a PR and monitor the Dependency Dashboard over the next week to confirm behavior matches expectations.
3. Adjust based on actual PR volume and team capacity.

## Related docs

- [Dependency Dashboard](https://docs.renovatebot.com/key-concepts/dashboard/)
- [Upgrade best practices](https://docs.renovatebot.com/upgrade-best-practices/)
- [Noise reduction](https://docs.renovatebot.com/noise-reduction/)
- [Configuration options](https://docs.renovatebot.com/configuration-options/)
