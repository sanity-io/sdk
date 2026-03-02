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
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }

    expect(() => renderSanityApp(null, namedResources, {}, <div>Test</div>)).toThrowError(
      'Missing root element to mount application into',
    )
  })

  it('creates root with the provided element', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }

    renderSanityApp(rootElement, namedResources, {}, <div>Test</div>)

    expect(mockCreateRoot).toHaveBeenCalledWith(rootElement)
    expect(mockCreateRoot).toHaveBeenCalledTimes(1)
  })

  it('merges namedResources into a single config and resources map', () => {
    const namedResources = {
      default: {resource: {projectId: 'project-1', dataset: 'production'}},
      secondary: {resource: {projectId: 'project-2', dataset: 'staging'}},
    }

    renderSanityApp(rootElement, namedResources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    expect(renderCall).toBeDefined()

    expect(renderCall.type).toBe(SanityApp)
    // config has no resource fields
    expect(renderCall.props.config).toEqual({})
    // resources map is populated from named entries
    expect(renderCall.props.resources).toEqual({
      default: {projectId: 'project-1', dataset: 'production'},
      secondary: {projectId: 'project-2', dataset: 'staging'},
    })
  })

  it('renders without StrictMode when reactStrictMode is false', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }
    const children = <div>Test Children</div>

    renderSanityApp(rootElement, namedResources, {reactStrictMode: false}, children)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]

    // Should not have StrictMode wrapper
    expect(renderCall.type).toBe(SanityApp)
    expect(renderCall.props.children).toEqual(children)
  })

  it('renders without StrictMode by default', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }
    const children = <div>Test Children</div>

    renderSanityApp(rootElement, namedResources, {}, children)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]

    // Should not have StrictMode wrapper when not specified
    expect(renderCall.type).toBe(SanityApp)
    expect(renderCall.props.children).toEqual(children)
  })

  it('renders with StrictMode when reactStrictMode is true', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }
    const children = <div>Test Children</div>

    renderSanityApp(rootElement, namedResources, {reactStrictMode: true}, children)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]

    // Should have StrictMode wrapper (StrictMode is a Symbol)
    expect(renderCall.type).toBeDefined()
    expect(renderCall.type.toString()).toContain('Symbol')
    const strictModeChild = renderCall.props.children
    expect(strictModeChild.type).toBe(SanityApp)
    expect(strictModeChild.props.children).toEqual(children)
  })

  it('passes loading fallback to SanityApp', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }

    renderSanityApp(rootElement, namedResources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.type).toBe(SanityApp)
    expect(sanityAppElement.props.fallback).toEqual(<div>Loading...</div>)
  })

  it('returns an unmount function', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }

    const unmount = renderSanityApp(rootElement, namedResources, {}, <div>Test</div>)

    expect(typeof unmount).toBe('function')
  })

  it('calls root.unmount when unmount function is invoked', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }

    const unmount = renderSanityApp(rootElement, namedResources, {}, <div>Test</div>)

    expect(mockUnmount).not.toHaveBeenCalled()
    unmount()
    expect(mockUnmount).toHaveBeenCalledTimes(1)
  })

  it('handles empty namedResources object', () => {
    const namedResources = {}

    renderSanityApp(rootElement, namedResources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.type).toBe(SanityApp)
    expect(sanityAppElement.props.config).toEqual({})
    expect(sanityAppElement.props.resources).toEqual({})
  })

  it('handles single namedSource', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }

    renderSanityApp(rootElement, namedResources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.type).toBe(SanityApp)
    expect(sanityAppElement.props.config).toEqual({})
    expect(sanityAppElement.props.resources).toEqual({
      default: {projectId: 'test-project', dataset: 'production'},
    })
  })

  it('merges multiple namedResources into one config with combined sources', () => {
    const namedResources = {
      default: {resource: {projectId: 'project-1', dataset: 'production'}},
      blog: {resource: {projectId: 'project-2', dataset: 'staging'}},
      ecommerce: {resource: {projectId: 'project-3', dataset: 'development'}},
    }

    renderSanityApp(rootElement, namedResources, {}, <div>Test</div>)

    expect(mockRender).toHaveBeenCalledTimes(1)
    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.type).toBe(SanityApp)
    expect(sanityAppElement.props.resources).toEqual({
      default: {projectId: 'project-1', dataset: 'production'},
      blog: {projectId: 'project-2', dataset: 'staging'},
      ecommerce: {projectId: 'project-3', dataset: 'development'},
    })
  })

  it('passes children to SanityApp', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }
    const children = (
      <div>
        <h1>Test App</h1>
        <p>Content</p>
      </div>
    )

    renderSanityApp(rootElement, namedResources, {}, children)

    const renderCall = mockRender.mock.calls[0][0]
    const sanityAppElement = renderCall

    expect(sanityAppElement.props.children).toEqual(children)
  })

  it('works with different types of children', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
    }

    // Test with string children
    renderSanityApp(rootElement, namedResources, {}, 'String child')

    let renderCall = mockRender.mock.calls[0][0]
    let sanityAppElement = renderCall

    expect(sanityAppElement.props.children).toBe('String child')

    // Test with null children
    mockRender.mockClear()
    renderSanityApp(rootElement, namedResources, {}, null)

    renderCall = mockRender.mock.calls[0][0]
    sanityAppElement = renderCall

    expect(sanityAppElement.props.children).toBe(null)

    // Test with array of children
    mockRender.mockClear()
    const arrayChildren = [<div key="1">Child 1</div>, <div key="2">Child 2</div>]
    renderSanityApp(rootElement, namedResources, {}, arrayChildren)

    renderCall = mockRender.mock.calls[0][0]
    sanityAppElement = renderCall

    expect(sanityAppElement.props.children).toEqual(arrayChildren)
  })

  it('integrates with StrictMode and passes all props correctly', () => {
    const namedResources = {
      default: {resource: {projectId: 'test-project', dataset: 'production'}},
      secondary: {resource: {projectId: 'test-project-2', dataset: 'staging'}},
    }
    const children = <div>App Content</div>

    renderSanityApp(rootElement, namedResources, {reactStrictMode: true}, children)

    const renderCall = mockRender.mock.calls[0][0]

    // Verify StrictMode wrapper (StrictMode is a Symbol)
    expect(renderCall.type).toBeDefined()
    expect(renderCall.type.toString()).toContain('Symbol')

    // Verify SanityApp is inside StrictMode
    const strictModeChild = renderCall.props.children
    expect(strictModeChild.type).toBe(SanityApp)

    // config has no resource fields; resources map carries them
    expect(strictModeChild.props.config).toEqual({})
    expect(strictModeChild.props.resources).toEqual({
      default: {projectId: 'test-project', dataset: 'production'},
      secondary: {projectId: 'test-project-2', dataset: 'staging'},
    })
    expect(strictModeChild.props.fallback).toEqual(<div>Loading...</div>)
    expect(strictModeChild.props.children).toEqual(children)
  })

  it('can be called multiple times with different roots', () => {
    const rootElement2 = document.createElement('div')
    document.body.appendChild(rootElement2)

    const namedResources1 = {
      default: {resource: {projectId: 'project-1', dataset: 'production'}},
    }
    const namedResources2 = {
      default: {resource: {projectId: 'project-2', dataset: 'staging'}},
    }

    const unmount1 = renderSanityApp(rootElement, namedResources1, {}, <div>App 1</div>)
    const unmount2 = renderSanityApp(rootElement2, namedResources2, {}, <div>App 2</div>)

    expect(mockCreateRoot).toHaveBeenCalledTimes(2)
    expect(mockCreateRoot).toHaveBeenNthCalledWith(1, rootElement)
    expect(mockCreateRoot).toHaveBeenNthCalledWith(2, rootElement2)

    unmount1()
    unmount2()

    expect(mockUnmount).toHaveBeenCalledTimes(2)

    document.body.removeChild(rootElement2)
  })
})
