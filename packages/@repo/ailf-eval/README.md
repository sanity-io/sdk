# @repo/ailf-eval

AI Literacy Framework (AILF) evaluation config and tasks for the SDK documentation.

AILF evaluates how well the SDK docs enable AI coding tools to implement features. The evaluation pipeline reads the task definitions in this package, submits them to the AILF API (`ailf-api.sanity.build`), and produces a score report. The repo only handles authoring tasks and config — the API handles LLM calls, doc fetching, grading, and report publishing.

## Layout

- `.ailf/config.yaml` — project configuration: the docs source (Sanity project/dataset/site URL), the `taskSource` (set to `repo` so AILF reads the tasks in this package), and the triggers that decide when evaluations run. This is the only config file `ailf run` reads.
- `.ailf/tasks/*.task.ts` — task definitions, authored with `defineTask` from [`@sanity/ailf`](https://www.npmjs.com/package/@sanity/ailf). Each task evaluates whether an AI coding agent can implement a feature using the docs as context. `sdk-list-documents.task.ts` is the starter task: it checks that an agent can build a paginated document list with the App SDK's `useDocuments` hook.

The workflow that runs evaluations lives at [`.github/workflows/ailf-eval.yml`](../../../.github/workflows/ailf-eval.yml) in the repo root.

## Authoring a task

Copy `sdk-list-documents.task.ts` in `.ailf/tasks/`, give it a unique `id`, and edit the prompt, context docs, and assertions. Tasks are active by default; set `status: "draft"` to keep one out of production evaluations while you iterate.

Full field reference: https://github.com/sanity-labs/ai-literacy-framework/blob/main/docs/contributing-tasks.md

## Scripts

- `pnpm eval` — submit the tasks in this package to the AILF API and write a score report (needs `AILF_API_KEY`). Run from the repo root as `pnpm ailf`.
- `pnpm lint` — lint the config and task files.
- `pnpm ts:check` — type-check the config and task files.
