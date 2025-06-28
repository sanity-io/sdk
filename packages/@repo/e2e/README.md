# SDK E2E testing

## Required Env Variables

The tests expect to find the below env variables. Either define them in your shell, or add them to the `.env.local` file in the repository root.

-- `SDK_E2E_SESSION_TOKEN`: The client fixture needs to use this token. Running `SANITY_INTERNAL_ENV=staging sanity debug --secrets` will give you your token provided you are logged in (`SANITY_INTERNAL_ENV=staging sanity login`).

- `SDK_E2E_PROJECT_ID`: We use 3j6vt2rg internally
- `SDK_E2E_ORGANIZATION_ID`: We use oFvj4MZWQ internally
- `SDK_E2E_USER_ID`: sdk+e2e@sanity.io
- `SDK_E2E_USER_PASSWORD`: found in 1Password
- `RECAPTCHA_E2E_STAGING_KEY`: found in 1Password
- `SDK_E2E_DATASET_0`=production
- `SDK_E2E_DATASET_1`=testing

## Running tests

To run E2E tests run the following commands from the root of the project

- Run all the tests

  ```sh
  pnpm test:e2e
  ```

- Run files that have my-spec or my-spec-2 in the file name

  ```sh
  pnpm test:e2e -- my-spec my-spec-2
  ```

- For help, run
  ```sh
  pnpm test:e2e --help
  ```

Other useful helper commands

- "dev:e2e": Starts the Kitchensink pointing to the E2E project and dataset. This server can be used by both you as a developer and the e2e tests at the same time for debugging purposes.

For more useful commands, see the [Playwright Command Line](https://playwright.dev/docs/test-cli) documentation.

### Running tests from your code editor

You can run your tests in your editor with the help of some useful editor plugins/extensions. For example, you can download `Playwright Test for VSCode` from Microsoft to show and run your tests in VSCode.

### Running in CI mode

These tests run in CI with a built application (rather than dev server). It also runs its tests in the Dashboard. If you'd like to replicate that, you should add the following variables to your .env.local file:

- `CI`: true
