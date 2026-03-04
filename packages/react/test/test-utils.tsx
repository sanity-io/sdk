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

const resources = {
  'media-library': {mediaLibraryId: 'media-library-id'},
  'canvas': {canvasId: 'canvas-id'},
  'dataset': {projectId: 'source-project-id', dataset: 'source-dataset'},
} as const

/**
 * This function holds the providers to wrap around UI in tests.
 * @internal
 */
export const AppProviders = ({children}: {children: React.ReactNode}): ReactElement => {
  return (
    <ResourceProvider resource={{projectId: 'test', dataset: 'test'}} fallback={null}>
      <ResourcesContext.Provider value={resources}>{children}</ResourcesContext.Provider>
    </ResourceProvider>
  )
}

type WrapperComponent = React.ComponentType<{children: React.ReactNode}>

/**
 * Composes a custom wrapper with AppProviders so the default providers are always present.
 * @internal
 */
const wrapWithAppProviders = (CustomWrapper?: WrapperComponent): WrapperComponent => {
  if (!CustomWrapper) return AppProviders
  const Composed: WrapperComponent = (props) => <CustomWrapper {...props} />
  return Composed
}

/**
 * This is a custom render function that wraps the UI in the AppProviders component.
 * Pass `options.wrapper` to add an extra wrapper inside AppProviders (e.g. for try/catch or Suspense).
 * @internal
 */
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & {wrapper?: WrapperComponent},
): RenderResult => {
  const {wrapper, ...rest} = options ?? {}
  return render(ui, {wrapper: wrapWithAppProviders(wrapper), ...rest})
}

/**
 * This is a custom render function that wraps hooks in the AppProviders component.
 * Pass `options.wrapper` to add an extra wrapper inside AppProviders (e.g. for try/catch or Suspense).
 * @internal
 */
const customRenderHook = <TProps, TResult>(
  hook: (props: TProps) => TResult,
  options?: Omit<RenderHookOptions<TProps>, 'wrapper'> & {wrapper?: WrapperComponent},
): RenderHookResult<TResult, TProps> => {
  const {wrapper, ...rest} = options ?? {}
  return renderHook(hook, {wrapper: wrapWithAppProviders(wrapper), ...rest})
}

// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
// eslint-disable-next-line react-refresh/only-export-components
export {customRender as render}
// eslint-disable-next-line react-refresh/only-export-components
export {customRenderHook as renderHook}
