import {type FrameLocator, type Page} from '@playwright/test'

/**
 * Unified interface for detecting elements in pages whether in iframe or not.
 * Methods delegate to either Page or FrameLocator depending on context,
 * and all arguments (including options like {exact: true}) are forwarded.
 */
export type PageContext = Pick<Page, 'getByTestId' | 'getByText' | 'getByRole' | 'locator'> & {
  isDashboard: boolean
  context: Page | FrameLocator
}

// Webkit is excluded from dashboard tests because webkit blocks script execution
// in sandboxed iframes without 'allow-scripts', and the dashboard creates
// sandboxed iframes that webkit cannot execute JavaScript in
// const DASHBOARD_PROJECTS = ['chromium', 'firefox']
const DASHBOARD_PROJECTS: string[] = []

/**
 * Determines if we're in a dashboard context by checking the project name
 */
function isDashboardContext(projectName: string): boolean {
  return DASHBOARD_PROJECTS.includes(projectName)
}

function buildContextMethods(target: Page | FrameLocator, isDashboard: boolean): PageContext {
  return {
    getByTestId: (...args) => target.getByTestId(...args),
    getByText: (...args) => target.getByText(...args),
    getByRole: (...args) => target.getByRole(...args),
    locator: (...args) => target.locator(...args),
    isDashboard,
    context: target,
  }
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

    const frame = iframe.contentFrame()
    if (!frame) {
      throw new Error('Failed to get iframe content frame')
    }

    return buildContextMethods(frame, true)
  }

  return buildContextMethods(page, false)
}
