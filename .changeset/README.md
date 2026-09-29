# Changesets

This folder holds [changesets](https://github.com/changesets/changesets) for the 2.x maintenance
line. Each `.md` file describes a user-facing change and the version bump it should trigger.

Run `pnpm changeset` to add one. The bump convention is the same as on `main`: `feat` is minor,
`fix` / `perf` / `revert` is patch.

When a PR with a changeset merges to `v2`, the Release workflow opens (or updates) a
`chore: release` Version PR against `v2`. Merging that Version PR publishes `@sanity/sdk` and
`@sanity/sdk-react` under the `v2-maintenance` npm dist-tag, so `latest` stays on the current
major, and pushes a `sdk-v2.x.y` tag.
