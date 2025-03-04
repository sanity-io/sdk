import {createSanityInstance} from '@sanity/sdk'
import {
  render,
  renderHook,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react'
import React, {type ReactElement} from 'react'

import {SanityProvider} from '../src/context/SanityProvider'

/**
 * This function holds the providers to wrap around UI in tests.
 * @internal
 */
export const AppProviders = ({children}: {children: React.ReactNode}): ReactElement => {
  const instance = createSanityInstance({
    resources: [{projectId: 'test', dataset: 'test'}],
  })
  return <SanityProvider sanityInstance={instance}>{children}</SanityProvider>
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

export * from '@testing-library/react'
export {customRender as render}
export {customRenderHook as renderHook}
