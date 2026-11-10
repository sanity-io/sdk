import {test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {updateUserPreferenceListItem, userPreferenceList} from './preferenceItems'
import {userPreference} from './preferences'

const instance = {} as SanityInstance

test('an item needs the fields its key declares, or undefined to remove it', () => {
  void updateUserPreferenceListItem(instance, {
    userId: 'u',
    key: 'studio.vision-tool.saved-queries',
    itemId: 'q1',
    value: {_key: 'q1', url: '?query=*', savedAt: '2026-11-09'},
  })
  void updateUserPreferenceListItem(instance, {
    userId: 'u',
    key: 'studio.vision-tool.saved-queries',
    itemId: 'q1',
    // @ts-expect-error A saved query needs a url
    value: {_key: 'q1', savedAt: '2026-11-09'},
  })
  void updateUserPreferenceListItem(instance, {
    userId: 'u',
    key: 'studio.vision-tool.saved-queries',
    itemId: 'q1',
    value: undefined,
  })
})

test('an items key is read a page at a time, never as one value', () => {
  userPreferenceList.getState(instance, 'u', 'studio.vision-tool.saved-queries')
  // @ts-expect-error Not a single-value key
  userPreference.getState(instance, 'u', 'studio.vision-tool.saved-queries')
  // @ts-expect-error Not an items key
  userPreferenceList.getState(instance, 'u', 'studio.structure-tool.inspect-view-mode')
})
