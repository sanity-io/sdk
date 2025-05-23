import {test} from '@playwright/test'

test.describe('My first test', () => {
  test('Kitchen sink loads', async ({page}) => {
    await page.goto('https://playwright.dev')
  })
})
