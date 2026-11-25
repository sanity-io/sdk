import {type CurrentUser} from '@sanity/sdk'
import {type CurrentUserAttribute} from '@sanity/types'
import {expectTypeOf, test} from 'vitest'

import {useCurrentUser} from './useCurrentUser'

test('useCurrentUser without options leaves out attributes', () => {
  const user = useCurrentUser()
  expectTypeOf(user).toEqualTypeOf<CurrentUser | null>()
  expectTypeOf<NonNullable<typeof user>>().not.toHaveProperty('attributes')
})

test('useCurrentUser with includeUserAttributes: true has optional attributes', () => {
  const user = useCurrentUser({includeUserAttributes: true})
  expectTypeOf(user?.attributes).toEqualTypeOf<CurrentUserAttribute[] | undefined>()
})

test('useCurrentUser with a boolean includeUserAttributes returns CurrentUser<boolean>', () => {
  const includeUserAttributes = false as boolean
  expectTypeOf(useCurrentUser({includeUserAttributes})).toEqualTypeOf<CurrentUser<boolean> | null>()
})
