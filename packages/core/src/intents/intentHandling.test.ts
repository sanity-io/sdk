import {describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {
  checkAndHandleCurrentIntent,
  executeIntent,
  getCurrentLocation,
  handleIntentUrl,
  parseIntentFromUrl,
} from './intentHandling'

describe('parseIntentFromUrl', () => {
  it('should parse a simple intent URL', () => {
    const url =
      'http://localhost:3000/intent/handleTranslation?payload=%7B%22text%22%3A%22hello%22%7D'
    const result = parseIntentFromUrl(url)

    expect(result).toEqual({
      intentName: 'handleTranslation',
      payload: {text: 'hello'},
    })
  })

  it('should parse intent URL with complex payload', () => {
    const payload = {
      text: 'Hello world',
      targetLanguage: 'es',
      documentId: 'doc123',
    }
    const encodedPayload = encodeURIComponent(JSON.stringify(payload))
    const url = `http://localhost:3000/intent/handleTranslation?payload=${encodedPayload}`
    const result = parseIntentFromUrl(url)

    expect(result).toEqual({
      intentName: 'handleTranslation',
      payload,
    })
  })

  it('should handle intent URL without payload', () => {
    const url = 'http://localhost:3000/intent/handlePreview'
    const result = parseIntentFromUrl(url)

    expect(result).toEqual({
      intentName: 'handlePreview',
      payload: undefined,
    })
  })

  it('should return null for non-intent URLs', () => {
    const url = 'http://localhost:3000/some-other-page'
    const result = parseIntentFromUrl(url)

    expect(result).toBeNull()
  })

  it('should handle custom base paths', () => {
    const url =
      'http://localhost:3000/custom/handleTranslation?payload=%7B%22text%22%3A%22hello%22%7D'
    const result = parseIntentFromUrl(url, '/custom')

    expect(result).toEqual({
      intentName: 'handleTranslation',
      payload: {text: 'hello'},
    })
  })

  it('should handle malformed JSON payload gracefully', () => {
    const url = 'http://localhost:3000/intent/handleTranslation?payload=invalid-json'
    const result = parseIntentFromUrl(url)

    expect(result).toEqual({
      intentName: 'handleTranslation',
      payload: 'invalid-json',
    })
  })

  it('should return null for empty intent name', () => {
    const url = 'http://localhost:3000/intent/'
    const result = parseIntentFromUrl(url)

    expect(result).toBeNull()
  })

  it('should handle URLs with trailing slashes', () => {
    const url = 'http://localhost:3000/intent/handleTranslation/'
    const result = parseIntentFromUrl(url)

    expect(result).toEqual({
      intentName: 'handleTranslation/',
      payload: undefined,
    })
  })
})

describe('executeIntent', () => {
  it('should execute an existing intent handler', async () => {
    const mockHandler = vi.fn().mockResolvedValue(undefined)
    const instance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
      intentHandlers: {
        handleTranslation: mockHandler,
      },
    })

    const payload = {text: 'hello', targetLanguage: 'es'}
    await executeIntent(instance, 'handleTranslation', payload)

    expect(mockHandler).toHaveBeenCalledWith(payload)
  })

  it('should warn when intent handler is not found', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const instance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
      intentHandlers: {},
    })

    await executeIntent(instance, 'nonExistentHandler', {})

    expect(consoleSpy).toHaveBeenCalledWith(
      "Intent handler 'nonExistentHandler' not found in configuration",
    )
    consoleSpy.mockRestore()
  })

  it('should handle missing intentHandlers config', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const instance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
    })

    await executeIntent(instance, 'someHandler', {})

    expect(consoleSpy).toHaveBeenCalledWith(
      "Intent handler 'someHandler' not found in configuration",
    )
    consoleSpy.mockRestore()
  })

  it('should handle handler execution errors', async () => {
    const error = new Error('Handler failed')
    const mockHandler = vi.fn().mockRejectedValue(error)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const instance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
      intentHandlers: {
        failingHandler: mockHandler,
      },
    })

    await expect(executeIntent(instance, 'failingHandler', {})).rejects.toThrow('Handler failed')
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error executing intent handler 'failingHandler':",
      error,
    )

    consoleSpy.mockRestore()
  })
})

describe('handleIntentUrl', () => {
  it('should handle a valid intent URL', async () => {
    const mockHandler = vi.fn().mockResolvedValue(undefined)
    const instance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
      intentHandlers: {
        handleTranslation: mockHandler,
      },
    })

    const url =
      'http://localhost:3000/intent/handleTranslation?payload=%7B%22text%22%3A%22hello%22%7D'
    const result = await handleIntentUrl(instance, url)

    expect(result).toBe(true)
    expect(mockHandler).toHaveBeenCalledWith({text: 'hello'})
  })

  it('should return false for non-intent URLs', async () => {
    const instance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
      intentHandlers: {},
    })

    const url = 'http://localhost:3000/some-other-page'
    const result = await handleIntentUrl(instance, url)

    expect(result).toBe(false)
  })

  it('should handle custom base paths', async () => {
    const mockHandler = vi.fn().mockResolvedValue(undefined)
    const instance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
      intentHandlers: {
        handleTranslation: mockHandler,
      },
    })

    const url =
      'http://localhost:3000/custom/handleTranslation?payload=%7B%22text%22%3A%22hello%22%7D'
    const result = await handleIntentUrl(instance, url, {basePath: '/custom'})

    expect(result).toBe(true)
    expect(mockHandler).toHaveBeenCalledWith({text: 'hello'})
  })
})

describe('getCurrentLocation', () => {
  it('should return window.location.href when available', () => {
    const mockLocation = {href: 'http://example.com/test'}
    vi.stubGlobal('window', {location: mockLocation})

    const result = getCurrentLocation()
    expect(result).toBe('http://example.com/test')

    vi.unstubAllGlobals()
  })

  it('should return default base when window is not available', () => {
    vi.stubGlobal('window', undefined)

    const result = getCurrentLocation()
    expect(result).toBe('http://localhost:3000')

    vi.unstubAllGlobals()
  })

  it('should handle errors gracefully', () => {
    vi.stubGlobal('window', {
      get location() {
        throw new Error('Access denied')
      },
    })

    const result = getCurrentLocation()
    expect(result).toBe('http://localhost:3000')

    vi.unstubAllGlobals()
  })
})

describe('checkAndHandleCurrentIntent', () => {
  it('should check and handle current intent URL', async () => {
    const mockHandler = vi.fn().mockResolvedValue(undefined)
    const instance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
      intentHandlers: {
        handleTranslation: mockHandler,
      },
    })

    const mockLocation = {
      href: 'http://localhost:3000/intent/handleTranslation?payload=%7B%22text%22%3A%22hello%22%7D',
    }
    vi.stubGlobal('window', {location: mockLocation})

    const result = await checkAndHandleCurrentIntent(instance)

    expect(result).toBe(true)
    expect(mockHandler).toHaveBeenCalledWith({text: 'hello'})

    vi.unstubAllGlobals()
  })

  it('should return false when current URL is not an intent', async () => {
    const instance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
      intentHandlers: {},
    })

    const mockLocation = {href: 'http://localhost:3000/some-other-page'}
    vi.stubGlobal('window', {location: mockLocation})

    const result = await checkAndHandleCurrentIntent(instance)

    expect(result).toBe(false)

    vi.unstubAllGlobals()
  })
})
