import {describe, it, expect} from 'vitest'
import {AuthError} from './AuthError'

describe('AuthError', () => {
  it('should use error message if provided', () => {
    const originalError = new Error('Authentication failed')
    const authError = new AuthError(originalError)

    expect(authError.message).toBe('Authentication failed')
    expect(authError.cause).toBe(originalError)
  })

  it('should handle non-error objects with message property', () => {
    const customError = {message: 'Custom error message'}
    const authError = new AuthError(customError)

    expect(authError.message).toBe('Custom error message')
    expect(authError.cause).toBe(customError)
  })

  it('should handle errors without message property', () => {
    const nonError = {foo: 'bar'}
    const authError = new AuthError(nonError)

    expect(authError.message).toBe('')
    expect(authError.cause).toBe(nonError)
  })

  it('should handle primitive error values', () => {
    const authError = new AuthError('string error')

    expect(authError.message).toBe('')
    expect(authError.cause).toBe('string error')
  })
})
