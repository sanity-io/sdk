import {describe, expect, it} from 'vitest'

import {getTestInstance} from '../__testUtils'
import {fetchUsers} from './fetchUsers'

const ESPEN_USER_ID = 'pDQYzJbyS'

describe('fetchUsers', () => {
  it('should be able to fetch a known user', async () => {
    const instance = await getTestInstance()
    const [espen] = await fetchUsers([ESPEN_USER_ID], instance)
    expect(espen, 'user object').toMatchObject({
      id: ESPEN_USER_ID,
      displayName: expect.stringMatching(/Espen/i),
      email: expect.stringMatching(/@/),
    })
  })
})
