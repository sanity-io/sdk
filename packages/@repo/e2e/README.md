# SDK E2E testing

## Required Env Variables

The tests expect to find the below env variables. Either define them in your shell, or add them to the `.env.local` file in the repository root.

- `SDK_E2E_SESSION_TOKEN`: As a developer running locally, you should use a user token. Running `sanity debug --secrets` will give you your token provided you are logged in (`sanity login`).

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

- "e2e:dev": Starts the Kitchensink as the E2E tests expect using the dev process.

For more useful commands, see the [Playwright Command Line](https://playwright.dev/docs/test-cli) documentation.

### Running tests from your code editor

You can run your tests in your editor with the help of some useful editor plugins/extensions. For example, you can download `Playwright Test for VSCode` from Microsoft to show and run your tests in VSCode.

### Running in CI mode

These tests run in CI with a dedicated e2e test user. If you'd like to replicate that, you should add the following variables to your .env.local file:

- `CI`: true
- `SDK_E2E_USER_ID`: sdk+e2e@sanity.io
- `SDK_E2E_USER_PASSWORD` (found in 1Password under "SDK e2e user Sanity login")
- `RECAPTCHA_E2E_STAGING_KEY` (found in 1Password under "Legion E2E staging reCAPTCHA bypass token")
