import {describe, expect, it} from 'vitest'

import {type IntentHandler, type IntentHandlers, type SanityConfig} from './sanityConfig'

describe('SanityConfig', () => {
  describe('intentHandlers', () => {
    it('should accept intent handlers with typed payloads', () => {
      interface TranslationPayload {
        text: string
        targetLanguage: string
      }

      interface PreviewPayload {
        documentId: string
        documentType: string
      }

      const handleTranslation: IntentHandler<TranslationPayload> = async (payload) => {
        // Type should be inferred as TranslationPayload
        expect(typeof payload.text).toBe('string')
        expect(typeof payload.targetLanguage).toBe('string')
      }

      const handlePreview: IntentHandler<PreviewPayload> = async (payload) => {
        // Type should be inferred as PreviewPayload
        expect(typeof payload.documentId).toBe('string')
        expect(typeof payload.documentType).toBe('string')
      }

      const intentHandlers: IntentHandlers = {
        handleTranslation,
        handlePreview,
      }

      const config: SanityConfig = {
        projectId: 'test-project',
        dataset: 'test-dataset',
        intentHandlers,
      }

      expect(config.intentHandlers).toBeDefined()
      expect(typeof config.intentHandlers?.['handleTranslation']).toBe('function')
      expect(typeof config.intentHandlers?.['handlePreview']).toBe('function')
    })

    it('should work without intent handlers', () => {
      const config: SanityConfig = {
        projectId: 'test-project',
        dataset: 'test-dataset',
      }

      expect(config.intentHandlers).toBeUndefined()
    })

    it('should allow generic payload types', async () => {
      const genericHandler: IntentHandler = async (payload) => {
        // payload should be typed as unknown
        expect(payload).toBeDefined()
      }

      const config: SanityConfig = {
        projectId: 'test-project',
        dataset: 'test-dataset',
        intentHandlers: {
          genericHandler,
        },
      }

      // Should be able to call the handler
      await config.intentHandlers?.['genericHandler']?.({someData: 'test'})
    })
  })
})
