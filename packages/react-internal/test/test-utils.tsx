import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react'
import {
  render,
  renderHook,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react'
import React, {type ReactElement} from 'react'

/**
 * This function holds the providers to wrap around UI in tests.
 * @internal
 */
export const AppProviders = ({children}: {children: React.ReactNode}): ReactElement => {
  const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
  return <SanityProvider sanityInstances={[instance]}>{children}</SanityProvider>
}

/**
 * This is a custom render function that wraps the UI in the AppProviders component.
 * @internal
 */
const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>): RenderResult =>
  render(ui, {wrapper: AppProviders, ...options})

/**
 * This is a custom render function that wraps hooks in the AppProviders component.
 * @internal
 */
const customRenderHook = <TProps, TResult>(
  hook: (props: TProps) => TResult,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderHookResult<TResult, TProps> => renderHook(hook, {wrapper: AppProviders, ...options})

// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
// eslint-disable-next-line react-refresh/only-export-components
export {customRender as render}
// eslint-disable-next-line react-refresh/only-export-components
export {customRenderHook as renderHook}
