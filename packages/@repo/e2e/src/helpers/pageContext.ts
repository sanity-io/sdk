import {type FrameLocator, type Page} from '@playwright/test'

/**
 * Unified interface for detecting elements in pages whether in iframe or not
 * (this might get lengthy with time but hopefully what we've provided here is sufficient)
 */
export type PageContext = Pick<Page, 'getByTestId' | 'getByText' | 'getByRole' | 'locator'> & {
  isDashboard: boolean
  context: Page | FrameLocator
}

const DASHBOARD_PROJECTS = ['dashboard-chromium']

/**
 * Determines if we're in a dashboard context by checking the project name
 */
function isDashboardContext(projectName: string): boolean {
  return DASHBOARD_PROJECTS.includes(projectName)
}

/**
 * Creates a unified page context that works both in iframe and standalone modes
 */
export async function createPageContext(page: Page, projectName: string): Promise<PageContext> {
  const inDashboard = isDashboardContext(projectName)

  if (inDashboard) {
    // Dashboard context - needs to be up-to-date with how this is implemented in the dashboard
    const iframe = page.getByTestId('app-frame')
    await iframe.waitFor({state: 'visible'})

    // Wait for iframe to be ready
    const frame = iframe.contentFrame()
    if (!frame) {
      throw new Error('Failed to get iframe content frame')
    }

    return {
      getByTestId: (testId: string) => frame.getByTestId(testId),
      getByText: (text: string | RegExp) => frame.getByText(text),
      getByRole: (role, options) => frame.getByRole(role, options),
      locator: (selector: string) => frame.locator(selector),
      isDashboard: true,
      context: frame,
    }
  } else {
    // Standalone context - work directly with page
    return {
      getByTestId: (testId: string) => page.getByTestId(testId),
      getByText: (text: string | RegExp) => page.getByText(text),
      getByRole: (role, options) => page.getByRole(role, options),
      locator: (selector: string) => page.locator(selector),
      isDashboard: false,
      context: page,
    }
  }
}
