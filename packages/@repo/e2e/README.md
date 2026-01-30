# SDK E2E testing

## Required Env Variables

The tests expect to find the below env variables. Either define them in your shell, or add them to the `.env.local` file in the repository root.

-- `SDK_E2E_SESSION_TOKEN`: The client fixture needs to use this token. Running `SANITY_INTERNAL_ENV=staging sanity debug --secrets` will give you your token provided you are logged in (`SANITY_INTERNAL_ENV=staging sanity login`).

- `SDK_E2E_PROJECT_ID`: We use 3j6vt2rg internally
- `SDK_E2E_ORGANIZATION_ID`: We use oFvj4MZWQ internally
- `SDK_E2E_USER_ID`: sdk+e2e@sanity.io
- `SDK_E2E_USER_PASSWORD`: found in 1Password
- `RECAPTCHA_E2E_STAGING_KEY`: found in 1Password as "E2E staging reCAPTCHA bypass token" in Dev Secrets
- `SDK_E2E_DATASET_0`=production
- `SDK_E2E_DATASET_1`=testing
- `SDK_E2E_MEDIA_LIBRARY_ID`=we use mlyobHbSHBsj internally
- `SDK_E2E_MEDIA_LIBRARY_TOKEN`=You can use the same token you used for session token if it's your user session token, otherwise generate this in the org admin page in Manage.

## Writing tests

@repo/e2e provides a specialized fixture for your tests, called `getPageContext`. This is because the tests run both standalone and in the Dashboard, meaning locators work a bit differently. Please use this fixture to ensure your tests work well in both environments. To do so, you should write your tests so that they do the following:

1. Navigate to the route you intend to test on, i.e., `await page.goto('./my-route')` (otherwise Playwright will be at about:blank and not know anything about iframes or not)
2. Use the `getPageContext` function with your page, like `const pageContext = await getPageContext(page)`
3. Use the locators provided by `pageContext`, like `const button = pageContext.getByTestId('my-button')

Here is a full example:

```ts
import {expect, test} from '@repo/e2e'

test('can click a button', async ({page, getPageContext}) => {
  await page.goto('./button-test-page')

  const pageContext = await getPageContext(page)

  await pageContext.getByTestId('my-button').click()
})
```

## Running tests

Right now, tests are split into two separate commands to make local testing easier. This is because we run our tests in the Dashboard, and Safari struggles with an iframed app in localhost. To run E2E tests run the following commands from the root of the project

- Run all the tests

  ```sh
  pnpm test:e2e:dashboard
  pnpm test:e2e:webkit
  ```

- Run files that have my-spec or my-spec-2 in the file name

  ```sh
  pnpm test:e2e:dashboard -- my-spec my-spec-2
  ```

- For help, run
  ```sh
  pnpm test:e2e -- --help
  ```

Other useful helper commands

- `dev:e2e`: Starts the Kitchensink pointing to the E2E project and dataset. This server can be used by both you as a developer and the e2e tests at the same time for debugging purposes.

NOTE: The `dev:e2e` command hardcodes the Sanity staging environment and the SDK e2e test organization as part of its command. If you'd like to run in a different target organization, you will have to temporarily change the command.

For more useful commands, see the [Playwright Command Line](https://playwright.dev/docs/test-cli) documentation.

### Running tests from your code editor

You can run your tests in your editor with the help of some useful editor plugins/extensions. For example, you can download `Playwright Test for VSCode` from Microsoft to show and run your tests in VSCode.

### Running in CI mode

These tests run in CI with a built application (rather than dev server). It also has more workers and retries. If you'd like to replicate that, you should add the following variables to your .env.local file:

- `CI`: true
