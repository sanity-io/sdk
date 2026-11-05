import {afterEach, describe, expect, it, vi} from 'vitest'

import {isErrorReportingEnabled} from './isErrorReportingEnabled'

function stubBrowser({
  importMap,
  debugFlag = false,
}: {
  importMap?: string
  debugFlag?: boolean
} = {}) {
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    querySelectorAll: () => (importMap === undefined ? [] : [{textContent: importMap}]),
  })
  vi.stubGlobal('localStorage', {getItem: () => (debugFlag ? '1' : null)})
}

describe('isErrorReportingEnabled', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is disabled outside a browser', () => {
    expect(isErrorReportingEnabled()).toBe(false)
  })

  it('is disabled without an import map or the debug flag', () => {
    stubBrowser()
    expect(isErrorReportingEnabled()).toBe(false)
  })

  it('is enabled when the import map has an @sanity/sdk entry', () => {
    stubBrowser({importMap: JSON.stringify({imports: {'@sanity/sdk': 'https://example.com/sdk'}})})
    expect(isErrorReportingEnabled()).toBe(true)
  })

  it('is disabled when the import map has no @sanity/sdk entry', () => {
    stubBrowser({importMap: JSON.stringify({imports: {react: 'https://example.com/react'}})})
    expect(isErrorReportingEnabled()).toBe(false)
  })

  it('is disabled when the import map is not valid JSON', () => {
    stubBrowser({importMap: '{not json'})
    expect(isErrorReportingEnabled()).toBe(false)
  })

  it('is disabled when the import map has no imports', () => {
    stubBrowser({importMap: '{}'})
    expect(isErrorReportingEnabled()).toBe(false)
  })

  it('is enabled by the debug flag', () => {
    stubBrowser({debugFlag: true})
    expect(isErrorReportingEnabled()).toBe(true)
  })

  it('is disabled when localStorage throws', () => {
    stubBrowser()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(isErrorReportingEnabled()).toBe(false)
  })
})
