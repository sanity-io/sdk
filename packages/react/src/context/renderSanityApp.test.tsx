import {type SanityConfig} from '@sanity/sdk'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {SanityApp} from '../components/SanityApp'
import {renderSanityApp} from './renderSanityApp'

// Hoist the mock functions
const mockRender = vi.hoisted(() => vi.fn())
const mockUnmount = vi.hoisted(() => vi.fn())
const mockCreateRoot = vi.hoisted(() =>
  vi.fn(() => ({
    render: mockRender,
    unmount: mockUnmount,
  })),
)

// Mock the SanityApp component
vi.mock('../components/SanityApp', () => ({
  SanityApp: vi.fn(({children}) => <div data-testid="sanity-app">{children}</div>),
}))

// Mock react-dom/client
vi.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}))

describe('renderSanityApp', () => {
  let rootElement: HTMLElement | null

  beforeEach(() => {
    vi.clearAllMocks()
    mockRender.mockClear()
    mockUnmount.mockClear()
    mockCreateRoot.mockClear()
    rootElement = document.createElement('div')
    document.body.appendChild(rootElement)
  })

  afterEach(() => {
    if (rootElement && rootElement.parentNode) {
      document.body.removeChild(rootElement)
    }
    rootElement = null
  })

  it('throws error when rootElement is null', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }

    expect(() => renderSanityApp(null, namedSources, {}, <div>Test</div>)).toThrowError(
      'Missing root element to mount application into',
    )
  })

  it('creates root with the provided element', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }

    renderSanityApp(rootElement, namedSources, {}, <div>Test</div>)

    expect(mockCreateRoot).toHaveBeenCalledWith(rootElement)
    expect(mockCreateRoot).toHaveBeenCalledTimes(1)
  })

  it('converts namedSources object to array of configs', () => {
    const namedSources = {
      main: {projectId: 'project-1', dataset: 'production'},
      secondary: {projectId: 'project-2', dataset: 'staging'},
    }

    renderSanityApp(rootElement, namedSources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    expect(renderCall).toBeDefined()

    // The renderCall is the SanityApp component directly when not using StrictMode
    expect(renderCall.type).toBe(SanityApp)
    expect(renderCall.props.config).toEqual([
      {projectId: 'project-1', dataset: 'production'},
      {projectId: 'project-2', dataset: 'staging'},
    ])
  })

  it('renders without StrictMode when reactStrictMode is false', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }
    const children = <div>Test Children</div>

    renderSanityApp(rootElement, namedSources, {reactStrictMode: false}, children)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]

    // Should not have StrictMode wrapper
    expect(renderCall.type).toBe(SanityApp)
    expect(renderCall.props.children).toEqual(children)
  })

  it('renders without StrictMode by default', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }
    const children = <div>Test Children</div>

    renderSanityApp(rootElement, namedSources, {}, children)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]

    // Should not have StrictMode wrapper when not specified
    expect(renderCall.type).toBe(SanityApp)
    expect(renderCall.props.children).toEqual(children)
  })

  it('renders with StrictMode when reactStrictMode is true', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }
    const children = <div>Test Children</div>

    renderSanityApp(rootElement, namedSources, {reactStrictMode: true}, children)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]

    // Should have StrictMode wrapper (StrictMode is a Symbol in React 18)
    expect(renderCall.type).toBeDefined()
    expect(renderCall.type.toString()).toContain('Symbol')
    const strictModeChild = renderCall.props.children
    expect(strictModeChild.type).toBe(SanityApp)
    expect(strictModeChild.props.children).toEqual(children)
  })

  it('passes loading fallback to SanityApp', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }

    renderSanityApp(rootElement, namedSources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.type).toBe(SanityApp)
    expect(sanityAppElement.props.fallback).toEqual(<div>Loading...</div>)
  })

  it('returns an unmount function', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }

    const unmount = renderSanityApp(rootElement, namedSources, {}, <div>Test</div>)

    expect(typeof unmount).toBe('function')
  })

  it('calls root.unmount when unmount function is invoked', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }

    const unmount = renderSanityApp(rootElement, namedSources, {}, <div>Test</div>)

    expect(mockUnmount).not.toHaveBeenCalled()
    unmount()
    expect(mockUnmount).toHaveBeenCalledTimes(1)
  })

  it('handles empty namedSources object', () => {
    const namedSources = {}

    renderSanityApp(rootElement, namedSources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.type).toBe(SanityApp)
    expect(sanityAppElement.props.config).toEqual([])
  })

  it('handles single namedSource', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }

    renderSanityApp(rootElement, namedSources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.type).toBe(SanityApp)
    expect(sanityAppElement.props.config).toEqual([
      {projectId: 'test-project', dataset: 'production'},
    ])
  })

  it('handles multiple namedSources', () => {
    const namedSources = {
      main: {projectId: 'project-1', dataset: 'production'},
      blog: {projectId: 'project-2', dataset: 'staging'},
      ecommerce: {projectId: 'project-3', dataset: 'development'},
    }

    renderSanityApp(rootElement, namedSources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.type).toBe(SanityApp)
    expect(sanityAppElement.props.config).toHaveLength(3)
    expect(sanityAppElement.props.config).toEqual([
      {projectId: 'project-1', dataset: 'production'},
      {projectId: 'project-2', dataset: 'staging'},
      {projectId: 'project-3', dataset: 'development'},
    ])
  })

  it('preserves order of namedSources in config array', () => {
    const namedSources = {
      z: {projectId: 'project-z', dataset: 'z-dataset'},
      a: {projectId: 'project-a', dataset: 'a-dataset'},
      m: {projectId: 'project-m', dataset: 'm-dataset'},
    }

    renderSanityApp(rootElement, namedSources, {}, <div>Test</div>)

    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    // Object.values preserves insertion order in modern JS
    expect(sanityAppElement.props.config).toEqual([
      {projectId: 'project-z', dataset: 'z-dataset'},
      {projectId: 'project-a', dataset: 'a-dataset'},
      {projectId: 'project-m', dataset: 'm-dataset'},
    ])
  })

  it('passes children to SanityApp', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }
    const children = (
      <div>
        <h1>Test App</h1>
        <p>Content</p>
      </div>
    )

    renderSanityApp(rootElement, namedSources, {}, children)

    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.props.children).toEqual(children)
  })

  it('works with different types of children', () => {
    const namedSources = {
      main: {projectId: 'test-project', dataset: 'production'},
    }

    // Test with string children
    renderSanityApp(rootElement, namedSources, {}, 'String child')

    let renderCall = mockRender.mock.calls[0][0]
    let sanityAppElement = renderCall

    expect(sanityAppElement.props.children).toBe('String child')

    // Test with null children
    mockRender.mockClear()
    renderSanityApp(rootElement, namedSources, {}, null)

    renderCall = mockRender.mock.calls[0][0]
    sanityAppElement = renderCall

    expect(sanityAppElement.props.children).toBe(null)

    // Test with array of children
    mockRender.mockClear()
    const arrayChildren = [<div key="1">Child 1</div>, <div key="2">Child 2</div>]
    renderSanityApp(rootElement, namedSources, {}, arrayChildren)

    renderCall = mockRender.mock.calls[0][0]
    sanityAppElement = renderCall

    expect(sanityAppElement.props.children).toEqual(arrayChildren)
  })

  it('integrates with StrictMode and passes all props correctly', () => {
    const namedSources = {
      main: {
        projectId: 'test-project',
        dataset: 'production',
        apiVersion: '2023-01-01',
      } as SanityConfig,
      secondary: {
        projectId: 'test-project-2',
        dataset: 'staging',
      } as SanityConfig,
    }
    const children = <div>App Content</div>

    renderSanityApp(rootElement, namedSources, {reactStrictMode: true}, children)

    const renderCall = mockRender.mock.calls[0][0]

    // Verify StrictMode wrapper (StrictMode is a Symbol in React 18)
    expect(renderCall.type).toBeDefined()
    expect(renderCall.type.toString()).toContain('Symbol')

    // Verify SanityApp is inside StrictMode
    const strictModeChild = renderCall.props.children
    expect(strictModeChild.type).toBe(SanityApp)

    // Verify all props are passed correctly
    expect(strictModeChild.props.config).toEqual([
      {projectId: 'test-project', dataset: 'production', apiVersion: '2023-01-01'},
      {projectId: 'test-project-2', dataset: 'staging'},
    ])
    expect(strictModeChild.props.fallback).toEqual(<div>Loading...</div>)
    expect(strictModeChild.props.children).toEqual(children)
  })

  it('can be called multiple times with different roots', () => {
    const rootElement2 = document.createElement('div')
    document.body.appendChild(rootElement2)

    const namedSources1 = {main: {projectId: 'project-1', dataset: 'production'}}
    const namedSources2 = {main: {projectId: 'project-2', dataset: 'staging'}}

    const unmount1 = renderSanityApp(rootElement, namedSources1, {}, <div>App 1</div>)
    const unmount2 = renderSanityApp(rootElement2, namedSources2, {}, <div>App 2</div>)

    expect(mockCreateRoot).toHaveBeenCalledTimes(2)
    expect(mockCreateRoot).toHaveBeenNthCalledWith(1, rootElement)
    expect(mockCreateRoot).toHaveBeenNthCalledWith(2, rootElement2)

    unmount1()
    unmount2()

    expect(mockUnmount).toHaveBeenCalledTimes(2)

    document.body.removeChild(rootElement2)
  })
})
