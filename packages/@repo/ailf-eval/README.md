# @repo/ailf-eval

AI Literacy Framework (AILF) evaluation config and tasks for the SDK documentation.

AILF evaluates how well the SDK docs enable AI coding tools to implement features. The evaluation pipeline reads the task definitions in this package, submits them to the AILF API (`ailf-api.sanity.build`), and produces a score report. The repo only handles authoring tasks and config — the API handles LLM calls, doc fetching, grading, and report publishing.

## Layout

- `.ailf/ailf.config.ts` — project configuration (authored with `defineRepoConfig` from `@sanity/ailf`): the docs source (Sanity project/dataset/site URL) and the `taskSource` (set to `repo` so AILF reads the tasks in this package).
- `.ailf/tasks/*.task.ts` — task definitions, authored with `defineTask` from [`@sanity/ailf`](https://www.npmjs.com/package/@sanity/ailf), with a `defineSdkTask` which also injects the API reference docs. Each task evaluates whether an AI coding agent can implement a feature using the docs as context. `sdk-list-documents.task.ts` is the starter task: it checks that an agent can build a paginated document list with the App SDK's `useDocuments` hook.

The workflow that runs evaluations lives at [`.github/workflows/ailf-eval.yml`](../../../.github/workflows/ailf-eval.yml) in the repo root. After each eval it also runs the docs-improvement job and appends the proposal to the run summary, below the dashboard report link (needs the `SANITY_DOCS_READ_TOKEN` and `ANTHROPIC_API_KEY` repo secrets).

## Authoring a task

Copy `sdk-list-documents.task.ts` in `.ailf/tasks/`, give it a unique `id`, and edit the prompt, context docs, and assertions. Tasks are active by default; set `status: "draft"` to keep one out of production evaluations while you iterate.

Full field reference: https://github.com/sanity-labs/ai-literacy-framework/blob/main/docs/contributing-tasks.md

## Scripts

- `pnpm eval` — submit the tasks in this package to the AILF API and write a score report (needs `AILF_API_KEY`). Run from the repo root as `pnpm ailf:eval`.
- `pnpm improve-docs` — run from the repo root as `pnpm ailf:improve-docs`. This will run headless Claude over the latest score report with read-only access to the docs dataset, and print proposed docs fixes as markdown to stdout (also saved next to the report as `docs-improvement.md`).
  Needs `SANITY_DOCS_READ_TOKEN` (please use a token that doesn't have write access) and `ANTHROPIC_API_KEY` (the agent runs against the Anthropic API). Applying proposals will be the next step, and will likely have a separate read token. See `scripts/improve-docs.ts` for the trust model.
- `pnpm lint` — lint the config and task files.
- `pnpm ts:check` — type-check the config and task files.

## Environment variables

Copy the repo-root `.env.example` to `.env.local` and fill in what you need (`.env.local` is git-ignored). `pnpm improve-docs` loads the repo-root `.env.local` automatically and tolerates it being absent (e.g. in CI, where the values come from secrets). `pnpm eval` does not read `.env.local` — export `AILF_API_KEY` in your shell (variables set in your shell also work for `improve-docs`, and take precedence over the file).

| Variable                 | Used by             | Notes                                                                                                                                |
| ------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `AILF_API_KEY`           | `pnpm eval`         | Auth for the AILF API. Sanity employees can find it in 1Password.                                                                    |
| `SANITY_DOCS_READ_TOKEN` | `pnpm improve-docs` | Token with read access to the docs dataset — prefer one that cannot write at all (see the trust model in `scripts/improve-docs.ts`). |
| `ANTHROPIC_API_KEY`      | `pnpm improve-docs` | Auth for the Anthropic API — the docs-improvement job runs a headless Claude agent.                                                  |

The docs project/dataset are not configurable via env — both jobs read them from `source` in `.ailf/ailf.config.ts` (`3do82whm`/`next`).
