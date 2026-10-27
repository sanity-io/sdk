import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {getProjectionState} from './getProjectionState'
import {resolveProjection} from './resolveProjection'
import {type DocumentStatus} from './types'

const instance = {} as SanityInstance
const options = {documentId: 'a', documentType: 'article', projection: '{title}'}

interface TitleProjection {
  title?: string
}

test('getProjectionState data includes _status alongside the projected fields', () => {
  const data = getProjectionState<TitleProjection>(instance, options).getCurrent()?.data
  expectTypeOf(data?._status).toEqualTypeOf<DocumentStatus | undefined>()
  expectTypeOf(data?.title).toEqualTypeOf<string | undefined>()
})

test('resolveProjection data includes _status alongside the projected fields', async () => {
  const {data} = await resolveProjection<TitleProjection>(instance, options)
  expectTypeOf(data?._status).toEqualTypeOf<DocumentStatus | undefined>()
  expectTypeOf(data?.title).toEqualTypeOf<string | undefined>()
})
