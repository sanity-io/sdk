import {afterEach, describe, expect, it, vi} from 'vitest'

import {getSdkDelivery, isErrorReportingEnabled} from './isErrorReportingEnabled'

function stubBrowser({
  hostname = 'myapp.example.com',
  userAgent = 'Mozilla/5.0 (Macintosh) Chrome/140.0',
  webdriver = false,
  importMap,
  debugFlag = false,
}: {
  hostname?: string
  userAgent?: string
  webdriver?: boolean
  importMap?: string
  debugFlag?: boolean
} = {}) {
  vi.stubGlobal('window', {location: {hostname}})
  vi.stubGlobal('navigator', {userAgent, webdriver})
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

  it('is enabled in a deployed app without an import map', () => {
    stubBrowser()
    expect(isErrorReportingEnabled()).toBe(true)
  })

  it.each([
    'localhost',
    'my-app.localhost',
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '[::1]',
    '[::]',
    '10.0.12.4',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.20',
    '169.254.10.1',
    '[fd12:3456::1]',
    '[fe80::1]',
    'my-laptop.local',
    '',
  ])('is disabled on the local or development host "%s"', (hostname) => {
    stubBrowser({hostname})
    expect(isErrorReportingEnabled()).toBe(false)
  })

  it.each([
    'localhost.example.com',
    'local.example.com',
    'myapp.localhost.example.com',
    '8.8.8.8',
    '172.32.0.1',
    '192.169.0.1',
    '[2001:db8::1]',
  ])('is enabled on the public host "%s"', (hostname) => {
    stubBrowser({hostname})
    expect(isErrorReportingEnabled()).toBe(true)
  })

  it('is disabled in a browser driven by test automation', () => {
    stubBrowser({webdriver: true})
    expect(isErrorReportingEnabled()).toBe(false)
  })

  it.each([
    ['jsdom', 'Mozilla/5.0 (darwin) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.1.0'],
    [
      'happy-dom',
      'Mozilla/5.0 (X11; Linux x64) AppleWebKit/537.36 (KHTML, like Gecko) HappyDOM/20.0.0',
    ],
  ])('is disabled in %s', (_name, userAgent) => {
    stubBrowser({userAgent})
    expect(isErrorReportingEnabled()).toBe(false)
  })

  it('is enabled by the debug flag on a local host and in a test DOM', () => {
    stubBrowser({hostname: 'localhost', userAgent: 'jsdom/26.1.0', debugFlag: true})
    expect(isErrorReportingEnabled()).toBe(true)
  })

  it('falls back to the host check when localStorage throws', () => {
    stubBrowser()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(isErrorReportingEnabled()).toBe(true)
  })
})

describe('getSdkDelivery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is auto-updates when the import map has an @sanity/sdk entry', () => {
    stubBrowser({importMap: JSON.stringify({imports: {'@sanity/sdk': 'https://example.com/sdk'}})})
    expect(getSdkDelivery()).toBe('auto-updates')
  })

  it.each([
    ['no import map', undefined],
    ['an import map without @sanity/sdk', JSON.stringify({imports: {react: 'x'}})],
    ['an import map that is not valid JSON', '{not json'],
    ['an import map without imports', '{}'],
  ])('is bundled with %s', (_name, importMap) => {
    stubBrowser({importMap})
    expect(getSdkDelivery()).toBe('bundled')
  })
})
