import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react'
import React, {type ReactElement} from 'react'

import {ResourceProvider} from '../src/context/ResourceProvider'
import {ResourcesContext} from '../src/context/ResourcesContext'

export const resources = {
  'media-library': {mediaLibraryId: 'media-library-id'},
  'canvas': {canvasId: 'canvas-id'},
  'dataset': {projectId: 'resource-project-id', dataset: 'resource-dataset'},
} as const

type WrapperComponent = React.ComponentType<{children: React.ReactNode}>

/**
 * Default providers for tests.
 * - SanityInstance config: projectId="test", dataset="test" (no ResourceContext set)
 * - ResourcesContext: named resources (media-library, canvas, dataset)
 * @internal
 */
export const AppProviders = ({children}: {children: React.ReactNode}): ReactElement => {
  return (
    <ResourceProvider projectId="test" dataset="test" fallback={null}>
      <ResourcesContext.Provider value={resources}>{children}</ResourcesContext.Provider>
    </ResourceProvider>
  )
}

/**
 * Returns the wrapper to use: AppProviders when no custom wrapper is provided,
 * or the custom wrapper alone (which should include its own providers as needed).
 * @internal
 */
const resolveWrapper = (CustomWrapper?: WrapperComponent): WrapperComponent => {
  return CustomWrapper ?? AppProviders
}

/**
 * Custom render that wraps UI in AppProviders by default.
 * Pass `options.wrapper` to replace AppProviders with a custom wrapper.
 * @internal
 */
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & {wrapper?: WrapperComponent},
): RenderResult => {
  const {wrapper, ...rest} = options ?? {}
  return render(ui, {wrapper: resolveWrapper(wrapper), ...rest})
}

/**
 * Custom renderHook that wraps hooks in AppProviders by default.
 * Pass `options.wrapper` to replace AppProviders with a custom wrapper.
 * @internal
 */
const customRenderHook = <TProps, TResult>(
  hook: (props: TProps) => TResult,
  options?: Omit<RenderHookOptions<TProps>, 'wrapper'> & {wrapper?: WrapperComponent},
): RenderHookResult<TResult, TProps> => {
  const {wrapper, ...rest} = options ?? {}
  return renderHook(hook, {wrapper: resolveWrapper(wrapper), ...rest})
}

// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
// eslint-disable-next-line react-refresh/only-export-components
export {customRender as render}
// eslint-disable-next-line react-refresh/only-export-components
export {customRenderHook as renderHook}
