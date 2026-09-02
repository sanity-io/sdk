# Renovate dependency management strategy

This doc explains how Renovate is configured for this repo and how we're expected to interact with it.

For Renovate's own docs, see [Dependency Dashboard](https://docs.renovatebot.com/key-concepts/dashboard/) and [Upgrade best practices](https://docs.renovatebot.com/upgrade-best-practices/).

## Key principles

1. **Automerge by default**, with CI as the safety net. Nothing is gated behind manual dashboard approval (except security alerts, which we review).
2. **Production dep updates trigger a patch release** via `fix(deps)` commits, aligning with release-please.
3. **Scope rules by package name, not file path** — pnpm catalogs make file paths unreliable for deciding what releases (see below).
4. **Follow Sanity's shared release-age policy.** External dependencies use the delay from the shared preset. Trusted upstream packages (Sanity-maintained, React, Next, `@types/*`, and the rest of the [preset exemption list](https://github.com/sanity-io/renovate-config/blob/main/min-age-exceptions.json)) have no delay. We do not override the company default locally.

## Where to look

- Config: [`.github/renovate.json`](renovate.json)
- Running state: [Dependency Dashboard issue](../../issues/9)
- Auto-approve workflow: [`.github/workflows/renovate-auto-approve.yml`](workflows/renovate-auto-approve.yml)

## Reading the dashboard

The dashboard groups pending work into sections. With approval gating removed, most are automatic.

### Pending Approval (should stay empty)

We no longer set `dependencyDashboardApproval` on any rule, so nothing should land here. If something does, it came from the upstream preset — worth a look.

### Awaiting Schedule (automatic)

Renovate processes these updates during its next scheduled run (`before 5am` UTC daily). Release-age checks are reevaluated when Renovate runs; they are not GitHub timers. No action required.

### Rate-Limited (automatic, but capped)

`prConcurrentLimit: 20` (max open PRs) and `prHourlyLimit: 5` (max PRs created per hour). New updates queue here when either ceiling is hit. Drain by merging open Renovate PRs, or raise a limit temporarily.

### Pending Status Checks (investigate if persistent)

We use `prCreation: "immediate"` so Renovate opens PRs right away rather than waiting for branch-level CI. Our CI fires on `pull_request:` events, so waiting for branch status would deadlock. A release-age check may remain pending while a version is still too new, but it should clear on a later Renovate run. GitHub Action digest updates and lock file maintenance need scoped exceptions because they lack a usable timestamp during branch processing; see [Updates without branch release timestamps](#updates-without-branch-release-timestamps).

### PR Closed (Blocked) (needs you)

A previous PR was closed without merging; Renovate won't retry unless you tick the box.

### Detected Dependencies (reference only)

Inventory of everything Renovate tracks. No action required.

## Automerge policy

Rules are scoped by **package name** (or, for apps, by file path) — never by `matchFileNames` on the published packages. Everything automerges after CI passes and applicable release-age checks clear; the auto-approve workflow supplies the required approval.

| Dependency type                                                                                          | Update type | Commit type                                 | Triggers release?     |
| -------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------- | --------------------- |
| `@sanity/*` (grouped as `sanity`)                                                                        | any         | `fix(deps)`                                 | **Yes, patch**        |
| Other production `dependencies` (catch-all)                                                              | any         | `fix(deps)`                                 | **Yes, patch**        |
| Catalog non-`@sanity` runtime deps (`rxjs`, `groq-js`, `react-compiler-runtime`, `react-error-boundary`) | any         | `chore`                                     | No — see caveat below |
| eslint / vitest / commitlint / react groups                                                              | any         | `chore(tooling)` / `chore(dev-deps)`        | No                    |
| `devDependencies`                                                                                        | any         | `chore(dev-deps)`                           | No                    |
| Anything under `apps/**`                                                                                 | any         | `chore(apps)`                               | No                    |
| `groq`, `@sanity/codegen`                                                                                | —           | disabled (pinned to `typegen-experimental`) | —                     |
| High-severity security                                                                                   | any         | varies                                      | varies                |
| Trusted upstream (Sanity-maintained, React, Next, `@types/*`, etc.)                                      | inherits    | inherits                                    | inherits              |

Majors are never grouped — each opens its own PR (`separateMajorMinor` is on by default), so a breaking bump is reviewed in isolation before it automerges.

### Why rules are scoped by package name

pnpm catalog deps live in `pnpm-workspace.yaml`; Renovate reports their `packageFile` as that file and their `depType` as `pnpm.catalog.<name>` — never `dependencies`. So `matchFileNames` on the published packages and a `matchDepTypes: ["dependencies"]` catch-all both **miss catalog deps**. Matching `@sanity/*` by name catches the bulk of our runtime deps (catalog or not) and auto-covers new ones, and the production `dependencies` catch-all covers the inline (non-catalog) deps.

**Caveat — catalog non-`@sanity` runtime deps.** A few runtime deps of core/react live in the catalog but aren't `@sanity`-scoped: `rxjs`, `groq-js`, `react-compiler-runtime`, `react-error-boundary`. The catch-all can't see them (catalog depType) and the `@sanity/*` rule doesn't match them, so they bump as `chore` and **don't trigger a release** on their own. If a fix in one of them needs to ship, either trigger a release another way or add it to a name-matched `fix` rule. The `/review` command flags dep changes that should be reconsidered here.

### Why we follow the shared release age

The default [`sanity-io/renovate-config`](https://github.com/sanity-io/renovate-config/blob/main/default.json) preset sets [`minimumReleaseAge`](https://docs.renovatebot.com/configuration-options/#minimumreleaseage) for Sanity repositories. We inherit that value so company policy changes apply here without another config change. `pnpm-workspace.yaml` mirrors the current value in minutes so package resolution applies the same delay.

Vulnerability alerts bypass the delay (`vulnerabilityAlerts.minimumReleaseAge: null`), so security advisories land immediately.

### Why 0 days for trusted upstream packages

The Sanity preset exempts packages we trust from the minimum-age delay: our own (`@sanity/*`, `sanity`, `groq`, `groq-js`) and framework deps we use heavily (`react*`, `next*`, `@types/*`, `pnpm`, `@portabletext/*`, etc.). The full list is in [`min-age-exceptions.json`](https://github.com/sanity-io/renovate-config/blob/main/min-age-exceptions.json).

### Updates without branch release timestamps

Renovate checks release age during dependency lookup and again while processing branch status. An [upstream bug](https://github.com/renovatebot/renovate/issues/45236) drops the timestamp before the branch check for digest updates. The check then stays pending forever under the default `timestamp-required` behavior, even when the lookup already confirmed that the release is old enough.

GitHub Action `digest` and `pinDigest` updates use `minimumReleaseAgeBehaviour: "timestamp-optional"`. When the `github-tags` datasource provides a timestamp, the lookup still applies the configured delay. The scoped override prevents the later branch check from treating the missing timestamp as a permanent failure.

Lock file maintenance has no single release timestamp, so Renovate's age check does not apply to that update type. pnpm still enforces `minimumReleaseAge: 1440` when it resolves package versions, which mirrors the current one-day company default.

## Commit messages and releases

Our rules align Renovate's commit types with [release-please](../release-please-config.json):

- `fix(deps)`: triggers a patch release. Used for `@sanity/*` and other production `dependencies`.
- `chore(*)`: hidden from the changelog. Used for dev deps, tooling groups, and apps.

If a production major dep breaks our public API, override the commit type at squash time from `fix(deps)` to `feat(deps)!` or add a `BREAKING CHANGE:` footer so release-please produces a minor/major release.

## pnpm version

Renovate reads the pnpm version from the root `package.json` `packageManager` field automatically. We do **not** set a `constraints.pnpm` override (it only drifts out of sync).

## Auto-approval workflow

Branch protection requires at least 1 approval before merging. The auto-approve workflow (`.github/workflows/renovate-auto-approve.yml`) waits for CI (build, test, lint, typecheck) and then approves so Renovate's automerge can proceed.

**Known gap**: the workflow uses `GITHUB_TOKEN`, whose approvals don't count toward CODEOWNERS or team-approval rules. Under the current branch protection, each Renovate PR still needs a qualifying reviewer.

## Expected weekly flow

**Mon–Thu**: Renovate opens PRs before 5am UTC. CI runs. PRs automerge as release age elapses and CI goes green.

**Release cadence**: 1–2 releases per week via release-please, driven by `fix(deps)` commits merging in.

## Monitoring & maintenance

### Weekly checklist

- Skim the [Dependency Dashboard](../../issues/9) for anything stuck (errored, or repeatedly failing automerge).
- Merge the release-please PR if ready.
- Note any major updates that need planning.

### Pre-release checklist

```bash
git log v2.4.0..HEAD --oneline --grep="fix(deps)"   # dependency changes since last release
pnpm run all                                          # full suite
pnpm run test:e2e                                     # E2E
pnpm run dev:kitchensink                              # smoke-test in the app
pnpm run build:bundle                                 # bundle size
```

## Troubleshooting

### A Renovate PR's lockfile looks broken

We use `postUpdateOptions: ["pnpmDedupe"]`. If a lockfile slips through broken, run `pnpm install` locally, commit, and push to the Renovate branch — Renovate won't overwrite manual commits.

### A PR won't automerge

1. Check CI status: all checks must pass.
2. Check the release age: a new version may still be inside the configured delay. A GitHub Action digest should clear after the lookup passes; if it stays pending, trigger a Renovate retry and check the upstream timestamp bug linked above.
3. Check the PR is approved: branch protection requires 1 approval (the auto-approve workflow supplies it once checks pass).

### I want to retry a closed Renovate PR

Find it in "PR Closed (Blocked)" on the dashboard and tick the box.

### The rate-limited queue is huge

Merge/close open Renovate PRs to drain it, or temporarily bump `prHourlyLimit` / `prConcurrentLimit` in `renovate.json`.

## Making changes

1. Edit `.github/renovate.json` (the `$schema` key provides editor validation; validate with `renovate-config-validator`).
2. Open a PR and watch the Dependency Dashboard over the next week to confirm behavior.

## Related docs

- [Dependency Dashboard](https://docs.renovatebot.com/key-concepts/dashboard/)
- [Upgrade best practices](https://docs.renovatebot.com/upgrade-best-practices/)
- [Configuration options](https://docs.renovatebot.com/configuration-options/)
