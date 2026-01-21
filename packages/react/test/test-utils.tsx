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
import {SourcesContext} from '../src/context/SourcesContext'

const sources = {
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
    <ResourceProvider projectId="test" dataset="test" fallback={null}>
      <SourcesContext.Provider value={sources}>{children}</SourcesContext.Provider>
    </ResourceProvider>
  )
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
  options?: Omit<RenderHookOptions<TProps>, 'wrapper'>,
): RenderHookResult<TResult, TProps> => renderHook(hook, {wrapper: AppProviders, ...options})

// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
// eslint-disable-next-line react-refresh/only-export-components
export {customRender as render}
// eslint-disable-next-line react-refresh/only-export-components
export {customRenderHook as renderHook}
