# SDK E2E testing

## Required Env Variables

The tests expect to find the below env variables. Either define them in your shell, or add them to the `.env.local` file in the repository root.

- `SDK_E2E_SESSION_TOKEN`: As a developer running locally, you should use a user token. Running `sanity debug --secrets` will give you your token provided you are logged in ()`sanity login`).
- `SANITY_E2E_PROJECT_ID`: Project ID of the studio
- `SANITY_E2E_DATASET`: Dataset name of the studio

## Running tests

To run E2E tests run the following commands from the root of the project

- Run all the tests

  ```sh
  pnpm test:e2e
  ```

- Run files that have my-spec or my-spec-2 in the file name

  ```sh
  pnpm test:e2e my-spec my-spec-2
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
