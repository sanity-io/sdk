import {describe, expect, it} from 'vitest'

import {getTestInstance} from '../__testUtils'
import {getUser} from './getUsers'

const ESPEN_USER_ID = 'pDQYzJbyS'

describe('getUser', () => {
  it('should be able to get a known user, caches for future lookups', async () => {
    const instance = await getTestInstance()
    const espen = await getUser(ESPEN_USER_ID, instance)
    expect(espen).toMatchObject({
      id: 'pDQYzJbyS',
      displayName: expect.stringMatching(/Espen/i),
      email: expect.stringMatching(/@/),
    })

    const secondLookup = await getUser(ESPEN_USER_ID, instance)
    expect(secondLookup, 'cached user lookup').toBe(espen)
  })
})
