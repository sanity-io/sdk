import {describe, expect, test} from 'vitest'

import {createGroqSearchFilter} from './createGroqSearchFilter'

describe('createGroqSearchFilter', () => {
  test('should create filter with wildcard added to the last token', () => {
    expect(createGroqSearchFilter('hello world')).toBe('[@] match text::query("hello world*")')
  })

  test('should create filter with wildcard added to the last non-negated token', () => {
    expect(createGroqSearchFilter('hello -world')).toBe('[@] match text::query("hello* -world")')
  })

  test('should create filter with wildcard before an exact match phrase', () => {
    expect(createGroqSearchFilter('hello "exact match"')).toBe(
      '[@] match text::query("hello* \\"exact match\\"")',
    )
  })

  test('should create filter without adding wildcard if the last eligible token already has one', () => {
    expect(createGroqSearchFilter('hello world*')).toBe('[@] match text::query("hello world*")')
  })

  test('should create filter without wildcard if the only token is negated', () => {
    expect(createGroqSearchFilter('-negated')).toBe('[@] match text::query("-negated")')
  })

  test('should create filter without wildcard if the only token is an exact phrase', () => {
    expect(createGroqSearchFilter('"exact phrase"')).toBe(
      '[@] match text::query("\\"exact phrase\\"")',
    )
  })

  test('should return empty string for empty input', () => {
    expect(createGroqSearchFilter('')).toBe('')
  })

  test('should return empty string for whitespace input', () => {
    expect(createGroqSearchFilter('  ')).toBe('')
  })

  test('should handle leading whitespace', () => {
    expect(createGroqSearchFilter(' leading space')).toBe('[@] match text::query("leading space*")')
  })

  test('should handle trailing whitespace', () => {
    expect(createGroqSearchFilter('trailing space ')).toBe(
      '[@] match text::query("trailing space*")',
    )
  })

  test('should handle multiple spaces between tokens', () => {
    expect(createGroqSearchFilter('multiple  spaces')).toBe(
      '[@] match text::query("multiple spaces*")',
    )
  })

  test('should handle mixed token types', () => {
    expect(createGroqSearchFilter('term1 "exact phrase" -negated term2')).toBe(
      '[@] match text::query("term1 \\"exact phrase\\" -negated term2*")',
    )
  })

  test('should handle mixed token types ending with negation', () => {
    expect(createGroqSearchFilter('term1 "exact phrase" term2 -negated')).toBe(
      '[@] match text::query("term1 \\"exact phrase\\" term2* -negated")',
    )
  })

  test('should handle mixed token types ending with exact match', () => {
    expect(createGroqSearchFilter('term1 -negated term2 "exact phrase"')).toBe(
      '[@] match text::query("term1 -negated term2* \\"exact phrase\\"")',
    )
  })
})
