import {ClientError, type SanityClient} from '@sanity/client'
import {of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {type MessageBusConnection} from '../dashboard/messageBus/bus'
import {getDashboardMessageBus} from '../dashboard/messageBus/store'
import {getDashboardOrganizationId, getTopicState} from '../dashboard/messageBus/topicStore'
import {observeAppOrganizationId} from '../organization/appOrganization'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {updateUserPreference, userPreference, whenOrganizationKnown} from './preferences'
import {type PreferenceEdit, type PreferenceKey} from './registry'

vi.mock('../client/clientStore')

vi.mock('../dashboard/messageBus/topicStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dashboard/messageBus/topicStore')>()),
  getDashboardOrganizationId: vi.fn(() => ({getCurrent: () => undefined})),
  getTopicState: vi.fn(),
}))

vi.mock('../dashboard/messageBus/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dashboard/messageBus/store')>()),
  getDashboardMessageBus: vi.fn(),
}))

vi.mock('../organization/appOrganization', () => ({observeAppOrganizationId: vi.fn()}))

// No declared key is stored per organization or shared yet, so the tests declare them
const TEST_KEYS: Record<string, {levels: string[]; defaultValue: unknown; list?: true}> = {
  'test.organization-key': {levels: ['user@organization'], defaultValue: 'none'},
  'test.shared-only-key': {levels: ['project'], defaultValue: 'none'},
  'test.shared-list-key': {levels: ['user@project', 'project'], defaultValue: [], list: true},
  'test.shared-key': {
    levels: ['user@project', 'user@organization', 'project', 'organization'],
    defaultValue: 'none',
  },
}
vi.mock('./registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./registry')>()
  return {...actual, lookUpKey: (key: string) => TEST_KEYS[key] ?? actual.lookUpKey(key)}
})

const ORGANIZATION_KEY = 'test.organization-key' as PreferenceKey
const SHARED_KEY = 'test.shared-key' as PreferenceKey
const SHARED_ONLY_KEY = 'test.shared-only-key' as PreferenceKey
const SHARED_LIST_KEY = 'test.shared-list-key' as PreferenceKey
const LAYOUT = 'studio.structure-tool.layout.book'
const PATH = '/projects/project-1/users/me/preferences'

const stored = (
  key: string,
  activeValue: unknown,
  activeLevel = 'user@project',
  canEdit?: boolean,
) => ({key, activeValue, activeLevel, canEdit})

const refusal = (statusCode: number, code: string, message: string) =>
  new ClientError({statusCode, headers: {}, body: {code, message}})

describe('preferences', () => {
  let instance: SanityInstance
  let storage: Map<string, string>
  const request = vi.fn()

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'project-1', dataset: 'production'})
    storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    request.mockReset()
    vi.mocked(getDashboardOrganizationId).mockReturnValue({
      getCurrent: () => undefined,
    } as ReturnType<typeof getDashboardOrganizationId>)
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => {
    instance.dispose()
    vi.unstubAllGlobals()
  })

  describe('reading', () => {
    it("reads a key from the user's own values in the app's project", async () => {
      request.mockReturnValue(of({data: [stored(LAYOUT, 'compact')]}))

      await expect(userPreference.resolveState(instance, 'user-1', LAYOUT)).resolves.toEqual({
        key: LAYOUT,
        value: 'compact',
        isDefault: false,
        shared: false,
        resourceType: 'project',
      })
      expect(getClientState).toHaveBeenCalledWith(instance, {
        apiVersion: '2026-11-07',
        scope: 'global',
      })
      expect(request).toHaveBeenCalledWith({
        url: PATH,
        query: {keys: LAYOUT},
        tag: 'preferences.get',
        timeout: 10_000,
      })
    })

    it('reads from the project the call names', async () => {
      request.mockReturnValue(of({data: [stored(LAYOUT, 'compact')]}))

      await userPreference.resolveState(instance, 'user-1', LAYOUT, {projectId: 'project-2'})

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({url: '/projects/project-2/users/me/preferences'}),
      )
    })

    it("shows the key's default when the user hasn't set one", async () => {
      request.mockReturnValue(of({data: [{key: LAYOUT, activeLevel: 'default'}]}))

      await expect(userPreference.resolveState(instance, 'user-1', LAYOUT)).resolves.toEqual({
        key: LAYOUT,
        value: 'default',
        isDefault: true,
        shared: false,
      })
    })

    it("fails with keyNotDeclared when the API doesn't know the key", async () => {
      request.mockReturnValue(of({data: []}))

      await expect(userPreference.resolveState(instance, 'user-1', LAYOUT)).rejects.toMatchObject({
        code: 'keyNotDeclared',
      })
    })

    it("fails with the API's reason when it refuses a read", async () => {
      request.mockReturnValue(
        throwError(() => refusal(403, 'accessDenied', "You can't read this project")),
      )

      await expect(userPreference.resolveState(instance, 'user-1', LAYOUT)).rejects.toMatchObject({
        code: 'accessDenied',
        statusCode: 403,
      })
    })

    it('passes an unexpected error on as it is, so error reporting still sees it', async () => {
      const bug = new Error('Something broke')
      request.mockReturnValue(throwError(() => bug))

      await expect(userPreference.resolveState(instance, 'user-1', LAYOUT)).rejects.toBe(bug)
    })

    it('reports a request the browser could not send as a network error', async () => {
      request.mockReturnValue(throwError(() => new TypeError('Failed to fetch')))

      await expect(userPreference.resolveState(instance, 'user-1', LAYOUT)).rejects.toMatchObject({
        code: 'networkError',
      })
    })
  })

  describe('cache', () => {
    it("starts from the value cached on the user's last visit, then reads it again", async () => {
      request.mockReturnValue(of({data: [stored(LAYOUT, 'compact', 'user@project', true)]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      instance.dispose()
      instance = createSanityInstance({projectId: 'project-1', dataset: 'production'})
      const read = new Subject<{data: unknown[]}>()
      request.mockReturnValue(read)

      const source = userPreference.getState(instance, 'user-1', LAYOUT)
      const unsubscribe = source.subscribe()

      expect(source.getCurrent()).toMatchObject({
        status: 'success',
        data: {value: 'compact', canEdit: true},
      })
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
      read.next({data: [stored(LAYOUT, 'detail')]})
      expect(source.getCurrent()).toMatchObject({data: {value: 'detail'}})
      unsubscribe()
    })

    it("never shows one user's cached value to another", async () => {
      request.mockReturnValue(of({data: [stored(LAYOUT, 'compact')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)

      expect(userPreference.getState(instance, 'user-2', LAYOUT).getCurrent()).toMatchObject({
        status: 'pending',
      })
    })

    it("ignores a cached value in a shape it can't read, like one an older SDK stored", () => {
      storage.set(
        `sanity-preferences:v1:user-1:${PATH}/${LAYOUT}`,
        JSON.stringify({key: LAYOUT, value: 'compact', level: 'user@project'}),
      )

      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        status: 'pending',
      })
    })
  })

  describe('writing', () => {
    it("shows a change at once, and keeps the API's answer", async () => {
      request.mockReturnValueOnce(of({data: [stored(LAYOUT, 'detail')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      const write = new Subject<unknown>()
      request.mockReturnValueOnce(write)

      const saved = updateUserPreference(instance, {
        userId: 'user-1',
        key: LAYOUT,
        value: 'compact',
      })

      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        data: {value: 'compact', isDefault: false, resourceType: 'project'},
      })
      expect(request).toHaveBeenLastCalledWith({
        url: `${PATH}/${LAYOUT}`,
        method: 'PUT',
        body: {value: 'compact'},
        tag: 'preferences.set',
        timeout: 10_000,
      })
      write.next(stored(LAYOUT, 'compact'))
      await expect(saved).resolves.toMatchObject({value: 'compact'})
      expect(storage.get(`sanity-preferences:v1:user-1:${PATH}/${LAYOUT}`)).toContain('compact')
    })

    it('brings the previous value back when the API refuses a change, and says why', async () => {
      request.mockReturnValueOnce(of({data: [stored(LAYOUT, 'detail')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      request.mockReturnValueOnce(
        throwError(() => refusal(400, 'valueInvalid', 'The value is too long')),
      )

      await expect(
        updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: 'x'.repeat(65)}),
      ).rejects.toMatchObject({code: 'valueInvalid', message: 'The value is too long'})
      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        data: {value: 'detail'},
      })
    })

    it('gives a function the value on screen, a change still on its way included', async () => {
      request.mockReturnValueOnce(of({data: [stored(LAYOUT, 'detail')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      const first = new Subject<unknown>()
      request.mockReturnValueOnce(first).mockReturnValueOnce(new Subject())
      const flip = (current: string) => (current === 'compact' ? 'detail' : 'compact')

      void updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: flip})
      void updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: flip})
      first.next(stored(LAYOUT, 'compact'))
      first.complete()

      expect(request).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({method: 'PUT', body: {value: 'compact'}}),
      )
      // Writes to a key go out one at a time, so the second waits for the first's answer
      await vi.waitFor(() =>
        expect(request).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({method: 'PUT', body: {value: 'detail'}}),
        ),
      )
    })

    it("reads a key that hasn't been read before giving it to a function", async () => {
      request.mockReturnValueOnce(of({data: [stored(LAYOUT, 'detail')]}))
      request.mockReturnValueOnce(of(stored(LAYOUT, 'compact')))

      await updateUserPreference(instance, {
        userId: 'user-1',
        key: LAYOUT,
        value: (current) => (current === 'detail' ? 'compact' : 'detail'),
      })

      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({method: 'PUT', body: {value: 'compact'}}),
      )
    })

    it('removes the value when a function returns undefined', async () => {
      request.mockReturnValueOnce(of({data: [stored(LAYOUT, 'compact')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      request.mockReturnValueOnce(of({key: LAYOUT, activeLevel: 'default'}))

      await updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: () => undefined})

      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({method: 'DELETE'}))
    })

    it('shows a later change once it saves, after an earlier one is refused', async () => {
      request.mockReturnValueOnce(of({data: [stored(LAYOUT, 'default')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      const first = new Subject<unknown>()
      const second = new Subject<unknown>()
      request.mockReturnValueOnce(first).mockReturnValueOnce(second)

      const compact = updateUserPreference(instance, {
        userId: 'user-1',
        key: LAYOUT,
        value: 'compact',
      })
      const detail = updateUserPreference(instance, {
        userId: 'user-1',
        key: LAYOUT,
        value: 'detail',
      })
      first.error(refusal(400, 'valueInvalid', 'No'))
      await expect(compact).rejects.toMatchObject({code: 'valueInvalid'})
      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        data: {value: 'detail'},
      })
      second.next(stored(LAYOUT, 'detail'))
      await detail

      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        data: {value: 'detail'},
      })
    })

    it('sends a change made right after a reset once the reset is answered, so the change wins', async () => {
      request.mockReturnValueOnce(of({data: [stored(LAYOUT, 'detail')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      const reset = new Subject<unknown>()
      request.mockReturnValueOnce(reset).mockReturnValueOnce(of(stored(LAYOUT, 'compact')))

      const resetting = updateUserPreference(instance, {
        userId: 'user-1',
        key: LAYOUT,
        value: undefined,
      })
      const saving = updateUserPreference(instance, {
        userId: 'user-1',
        key: LAYOUT,
        value: 'compact',
      })
      await Promise.resolve()
      expect(request).toHaveBeenCalledTimes(2)
      reset.next(stored(LAYOUT, 'default', 'default'))
      reset.complete()
      await Promise.all([resetting, saving])

      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({method: 'PUT'}))
      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        data: {value: 'compact'},
      })
    })

    it('sends a reset made right after a change once the change is answered, so the reset wins', async () => {
      request.mockReturnValueOnce(of({data: [stored(LAYOUT, 'detail')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      const saved = new Subject<unknown>()
      request
        .mockReturnValueOnce(saved)
        .mockReturnValueOnce(of(stored(LAYOUT, 'default', 'default')))

      const saving = updateUserPreference(instance, {
        userId: 'user-1',
        key: LAYOUT,
        value: 'compact',
      })
      const resetting = updateUserPreference(instance, {
        userId: 'user-1',
        key: LAYOUT,
        value: undefined,
      })
      await Promise.resolve()
      expect(request).toHaveBeenCalledTimes(2)
      saved.next(stored(LAYOUT, 'compact'))
      saved.complete()
      await Promise.all([saving, resetting])

      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({method: 'DELETE'}))
      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        data: {value: 'default', isDefault: true},
      })
    })

    it("shows nothing for a key that hasn't been read while its reset is sent", () => {
      request.mockReturnValueOnce(new Subject())

      void updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: undefined})

      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        status: 'pending',
        data: undefined,
      })
    })

    it('shows the value a first read answers with while a reset of the key is sent', async () => {
      const read = new Subject<unknown>()
      const reset = new Subject<unknown>()
      request.mockImplementation((options) => (options.method === 'DELETE' ? reset : read))

      const reading = userPreference.resolveState(instance, 'user-1', LAYOUT)
      await vi.waitFor(() => expect(read.observed).toBe(true))
      const resetting = updateUserPreference(instance, {
        userId: 'user-1',
        key: LAYOUT,
        value: undefined,
      })
      await vi.waitFor(() => expect(reset.observed).toBe(true))
      read.next({data: [stored(LAYOUT, 'compact')]})
      read.complete()
      await expect(reading).resolves.toMatchObject({value: 'compact'})
      reset.error(refusal(403, 'accessDenied', 'No'))
      await expect(resetting).rejects.toMatchObject({code: 'accessDenied'})

      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        status: 'success',
        data: {value: 'compact'},
      })
    })

    it("removes the value for undefined, showing what applies next once it's answered", async () => {
      request.mockReturnValueOnce(of({data: [stored(LAYOUT, 'compact')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      const reset = new Subject<unknown>()
      request.mockReturnValueOnce(reset)

      const done = updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: undefined})

      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        data: {value: 'compact'},
      })
      expect(request).toHaveBeenLastCalledWith({
        url: `${PATH}/${LAYOUT}`,
        method: 'DELETE',
        tag: 'preferences.reset',
        timeout: 10_000,
      })
      reset.next({key: LAYOUT, activeLevel: 'default'})
      await done
      expect(userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toMatchObject({
        data: {value: 'default', isDefault: true},
      })
    })
  })

  describe('lists', () => {
    const FAVORITES = 'manage.favorites.projects'
    const USER_PATH = '/users/me/preferences'
    const favorites = (...refs: string[]) => refs.map((ref) => ({ref}))

    async function readFavorites(...refs: string[]) {
      request.mockReturnValueOnce(of({data: [stored(FAVORITES, favorites(...refs), 'user', true)]}))
      await userPreference.resolveState(instance, 'user-1', FAVORITES)
    }

    const current = () => userPreference.getState(instance, 'user-1', FAVORITES).getCurrent()

    it("reads a list from the user's own values, which apply everywhere, without needing a project", async () => {
      instance.dispose()
      instance = createSanityInstance({})
      request.mockReturnValue(of({data: [stored(FAVORITES, favorites('a'), 'user')]}))

      await expect(userPreference.resolveState(instance, 'user-1', FAVORITES)).resolves.toEqual({
        key: FAVORITES,
        value: favorites('a'),
        isDefault: false,
        shared: false,
      })
      expect(request).toHaveBeenCalledWith(expect.objectContaining({url: USER_PATH}))
    })

    const edit = (value: PreferenceEdit<typeof FAVORITES>) =>
      updateUserPreference(instance, {userId: 'user-1', key: FAVORITES, value})

    it("adds items to the end at once, and keeps the API's answer", async () => {
      await readFavorites('a')
      const write = new Subject<unknown>()
      request.mockReturnValueOnce(write)

      const added = edit((list) => [...list, {ref: 'b'}])

      await vi.waitFor(() =>
        expect(current()).toMatchObject({
          data: {value: favorites('a', 'b'), isDefault: false},
        }),
      )
      expect(request).toHaveBeenLastCalledWith({
        url: USER_PATH,
        method: 'PATCH',
        body: {data: [{key: FAVORITES, add: favorites('b'), at: 'end'}]},
        tag: 'preferences.list.change',
        timeout: 10_000,
      })
      // Another tab starred `z` meanwhile, so the API's list differs from the one shown
      write.next({data: [stored(FAVORITES, favorites('z', 'a', 'b'), 'user')]})
      await expect(added).resolves.toMatchObject({value: favorites('z', 'a', 'b')})
      expect(current()).toMatchObject({data: {value: favorites('z', 'a', 'b')}})
      expect(storage.get(`sanity-preferences:v1:user-1:${USER_PATH}/${FAVORITES}`)).toContain('"z"')
    })

    it('adds items to the start', async () => {
      await readFavorites('a')
      request.mockReturnValueOnce(new Subject())

      void edit((list) => [{ref: 'b'}, ...list])

      await vi.waitFor(() => expect(current()).toMatchObject({data: {value: favorites('b', 'a')}}))
      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: {data: [{key: FAVORITES, add: favorites('b'), at: 'start'}]},
        }),
      )
    })

    it('sends an item changed in place as an add, which updates it where it is', async () => {
      await readFavorites('a', 'b')
      request.mockReturnValueOnce(new Subject())

      void edit((list) =>
        list.map((item) => (item.ref === 'a' ? {...item, data: 'updated'} : item)),
      )

      await vi.waitFor(() =>
        expect(current()).toMatchObject({data: {value: [{ref: 'a', data: 'updated'}, {ref: 'b'}]}}),
      )
      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: {data: [{key: FAVORITES, add: [{ref: 'a', data: 'updated'}], at: 'end'}]},
        }),
      )
    })

    it('removes items by their ref at once', async () => {
      await readFavorites('a', 'b', 'c')
      request.mockReturnValueOnce(new Subject())

      void edit((list) => list.filter((item) => item.ref === 'b'))

      await vi.waitFor(() => expect(current()).toMatchObject({data: {value: favorites('b')}}))
      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({body: {data: [{key: FAVORITES, remove: ['a', 'c']}]}}),
      )
    })

    it('removes and adds in one request, so the API saves both or neither', async () => {
      await readFavorites('a', 'b')
      request.mockReturnValueOnce(new Subject())

      void edit(favorites('b', 'c'))

      await vi.waitFor(() => expect(current()).toMatchObject({data: {value: favorites('b', 'c')}}))
      expect(request).toHaveBeenCalledTimes(2)
      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: {
            data: [
              {key: FAVORITES, remove: ['a']},
              {key: FAVORITES, add: favorites('c'), at: 'end'},
            ],
          },
        }),
      )
    })

    it('brings the whole list back when the API refuses a change, and says why', async () => {
      await readFavorites('a')
      request.mockReturnValueOnce(
        throwError(() => refusal(400, 'quotaExceeded', 'The list holds up to 100 items')),
      )

      await expect(edit(favorites('b'))).rejects.toMatchObject({code: 'quotaExceeded'})
      expect(current()).toMatchObject({data: {value: favorites('a')}})
    })

    it('replaces the whole list for a reorder, which adding and removing items cannot do', async () => {
      await readFavorites('a', 'b')
      request.mockReturnValueOnce(new Subject())

      void edit(favorites('b', 'a'))

      await vi.waitFor(() => expect(current()).toMatchObject({data: {value: favorites('b', 'a')}}))
      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: `${USER_PATH}/${FAVORITES}`,
          method: 'PUT',
          body: {value: favorites('b', 'a')},
        }),
      )
    })

    it('keeps a second star on screen while the first one is answered', async () => {
      await readFavorites()
      const first = new Subject<unknown>()
      request.mockReturnValueOnce(first).mockReturnValueOnce(new Subject())

      const starred = edit((list) => [...list, {ref: 'a'}])
      void edit((list) => [...list, {ref: 'b'}])
      first.next({data: [stored(FAVORITES, favorites('a'), 'user')]})
      await starred

      expect(current()).toMatchObject({data: {value: favorites('a', 'b')}})
    })

    it('keeps a later star when an earlier one is refused', async () => {
      await readFavorites()
      const first = new Subject<unknown>()
      const second = new Subject<unknown>()
      request.mockReturnValueOnce(first).mockReturnValueOnce(second)

      const a = edit((list) => [...list, {ref: 'a'}])
      const b = edit((list) => [...list, {ref: 'b'}])
      first.error(refusal(400, 'quotaExceeded', 'The list holds up to 100 items'))
      await expect(a).rejects.toMatchObject({code: 'quotaExceeded'})
      expect(current()).toMatchObject({data: {value: favorites('b')}})
      second.next({data: [stored(FAVORITES, favorites('b'), 'user')]})
      await b

      expect(current()).toMatchObject({data: {value: favorites('b')}})
    })

    it('replaces the whole list for a new item in its middle', async () => {
      await readFavorites('a', 'b')
      request.mockReturnValueOnce(new Subject())

      void edit(favorites('a', 'c', 'b'))

      await vi.waitFor(() =>
        expect(request).toHaveBeenLastCalledWith(expect.objectContaining({method: 'PUT'})),
      )
    })

    it('sends nothing when the list is the same', async () => {
      await readFavorites('a', 'b')

      await expect(edit(favorites('a', 'b'))).resolves.toMatchObject({value: favorites('a', 'b')})
      expect(request).toHaveBeenCalledTimes(1)
    })

    it('refuses a list with the same item twice, and sends nothing', async () => {
      await readFavorites('a')

      await expect(edit(favorites('a', 'b', 'b'))).rejects.toMatchObject({
        code: 'valueInvalid',
        message: expect.stringContaining('"b" more than once'),
      })
      expect(request).toHaveBeenCalledTimes(1)
    })

    it("reads a list that hasn't been read yet, and sends only what changed", async () => {
      request.mockReturnValueOnce(of({data: [stored(FAVORITES, favorites('a'), 'user')]}))
      request.mockReturnValueOnce(new Subject())

      void edit((list) => [...list, {ref: 'b'}])

      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({body: {data: [{key: FAVORITES, add: favorites('b'), at: 'end'}]}}),
      )
    })

    it('replaces a list of strings, which is a value and not a list of items', async () => {
      request.mockReturnValueOnce(new Subject())

      void updateUserPreference(instance, {
        userId: 'user-1',
        key: 'studio.announcement.seen',
        value: ['bulk-edit'],
      })

      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({method: 'PUT', body: {value: ['bulk-edit']}}),
      )
    })
  })

  describe('shared values', () => {
    it('reads the value everyone in the project shares, and whether the user can change it', async () => {
      request.mockReturnValue(of({data: [stored(SHARED_KEY, 'compact', 'project', false)]}))

      await expect(
        userPreference.resolveState(instance, 'user-1', SHARED_KEY, {shared: true}),
      ).resolves.toEqual({
        key: SHARED_KEY,
        value: 'compact',
        isDefault: false,
        shared: true,
        resourceType: 'project',
        canEdit: false,
      })
      expect(request).toHaveBeenCalledWith({
        url: '/projects/project-1/preferences',
        query: {keys: SHARED_KEY},
        tag: 'preferences.get',
        timeout: 10_000,
      })
    })

    it("reads the organization's shared value when the call has no project", async () => {
      instance.dispose()
      instance = createSanityInstance({organizationId: 'org-9'})
      request.mockReturnValue(of({data: [stored(SHARED_KEY, 'compact', 'organization')]}))

      await userPreference.resolveState(instance, 'user-1', SHARED_KEY, {shared: true})

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({url: '/organizations/org-9/preferences'}),
      )
    })

    it("shows the shared value to a user who hasn't set their own", async () => {
      request.mockReturnValue(of({data: [stored(SHARED_KEY, 'compact', 'project')]}))

      await expect(
        userPreference.resolveState(instance, 'user-1', SHARED_KEY),
      ).resolves.toMatchObject({
        value: 'compact',
        shared: true,
        resourceType: 'project',
      })
      expect(request).toHaveBeenCalledWith(expect.objectContaining({url: PATH}))
    })

    it('shows a change to the shared value at once', async () => {
      request.mockReturnValueOnce(of({data: [stored(SHARED_KEY, 'none', 'default', true)]}))
      await userPreference.resolveState(instance, 'user-1', SHARED_KEY, {shared: true})
      request.mockReturnValueOnce(new Subject())

      void updateUserPreference(instance, {
        userId: 'user-1',
        key: SHARED_KEY,
        value: 'compact',
        shared: true,
      })

      expect(
        userPreference.getState(instance, 'user-1', SHARED_KEY, {shared: true}).getCurrent(),
      ).toMatchObject({
        data: {value: 'compact', shared: true, resourceType: 'project', canEdit: true},
      })
      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: `/projects/project-1/preferences/${SHARED_KEY}`,
          method: 'PUT',
        }),
      )
    })

    it("refreshes the user's own read once the shared value they see has changed", async () => {
      request.mockReturnValueOnce(of({data: [stored(SHARED_KEY, 'compact', 'project')]}))
      const own = userPreference.getState(instance, 'user-1', SHARED_KEY)
      const unsubscribe = own.subscribe()
      await vi.waitFor(() => expect(own.getCurrent()).toMatchObject({data: {value: 'compact'}}))
      request
        .mockReturnValueOnce(of(stored(SHARED_KEY, 'detail', 'project')))
        .mockReturnValueOnce(of({data: [stored(SHARED_KEY, 'detail', 'project')]}))

      await updateUserPreference(instance, {
        userId: 'user-1',
        key: SHARED_KEY,
        value: 'detail',
        shared: true,
      })

      await vi.waitFor(() =>
        expect(own.getCurrent()).toMatchObject({
          data: {value: 'detail', shared: true, resourceType: 'project'},
        }),
      )
      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({url: PATH}))
      unsubscribe()
    })

    it("refreshes the user's own read once the shared list they see has changed", async () => {
      request.mockReturnValueOnce(of({data: [stored(SHARED_LIST_KEY, [{ref: 'a'}], 'project')]}))
      const own = userPreference.getState(instance, 'user-1', SHARED_LIST_KEY)
      const unsubscribe = own.subscribe()
      await vi.waitFor(() => expect(own.getCurrent()).toMatchObject({data: {shared: true}}))
      const sharedList = [{ref: 'a'}, {ref: 'b'}]
      request
        .mockReturnValueOnce(of({data: [stored(SHARED_LIST_KEY, [{ref: 'a'}], 'project')]}))
        .mockReturnValueOnce(of({data: [stored(SHARED_LIST_KEY, sharedList, 'project')]}))
        .mockReturnValueOnce(of({data: [stored(SHARED_LIST_KEY, sharedList, 'project')]}))

      await updateUserPreference(instance, {
        userId: 'user-1',
        key: SHARED_LIST_KEY,
        value: (list) => [...(list as {ref: string}[]), {ref: 'b'}],
        shared: true,
      })

      await vi.waitFor(() => expect(own.getCurrent()).toMatchObject({data: {value: sharedList}}))
      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({url: PATH}))
      unsubscribe()
    })

    it("refreshes the user's own read once an item is removed from the shared list", async () => {
      request.mockReturnValueOnce(of({data: [stored(SHARED_LIST_KEY, [{ref: 'a'}], 'project')]}))
      const own = userPreference.getState(instance, 'user-1', SHARED_LIST_KEY)
      const unsubscribe = own.subscribe()
      await vi.waitFor(() => expect(own.getCurrent()).toMatchObject({data: {shared: true}}))
      request
        .mockReturnValueOnce(of({data: [stored(SHARED_LIST_KEY, [{ref: 'a'}], 'project')]}))
        .mockReturnValueOnce(of({data: [stored(SHARED_LIST_KEY, [], 'project')]}))
        .mockReturnValueOnce(of({data: [stored(SHARED_LIST_KEY, [], 'project')]}))

      await updateUserPreference(instance, {
        userId: 'user-1',
        key: SHARED_LIST_KEY,
        value: [],
        shared: true,
      })

      await vi.waitFor(() => expect(own.getCurrent()).toMatchObject({data: {value: []}}))
      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({url: PATH}))
      unsubscribe()
    })

    it("brings the shared value back when a user who can't change it tries to", async () => {
      request.mockReturnValueOnce(of({data: [stored(SHARED_KEY, 'compact', 'project', false)]}))
      await userPreference.resolveState(instance, 'user-1', SHARED_KEY, {shared: true})
      const write = new Subject<unknown>()
      request.mockReturnValueOnce(write)
      const shared = userPreference.getState(instance, 'user-1', SHARED_KEY, {shared: true})

      const saved = updateUserPreference(instance, {
        userId: 'user-1',
        key: SHARED_KEY,
        value: 'detail',
        shared: true,
      })
      expect(shared.getCurrent()).toMatchObject({data: {value: 'detail'}})
      write.error(refusal(403, 'accessDenied', "You can't change this project's value"))

      await expect(saved).rejects.toMatchObject({code: 'accessDenied'})
      expect(shared.getCurrent()).toMatchObject({data: {value: 'compact', canEdit: false}})
    })

    it("fails with a clear error for a key that has no shared value, rather than using the user's own", () => {
      expect(() =>
        userPreference
          .getState(instance, 'user-1', 'manage.favorites.projects', {shared: true})
          .getCurrent(),
      ).toThrow(
        expect.objectContaining({
          code: 'levelNotAllowed',
          message: expect.stringContaining('has no shared value'),
        }),
      )
    })

    it('fails with a clear error when a key that only has a shared value is read without `shared`', () => {
      expect(() =>
        userPreference.getState(instance, 'user-1', SHARED_ONLY_KEY).getCurrent(),
      ).toThrow(
        expect.objectContaining({
          code: 'levelNotAllowed',
          message: expect.stringContaining('Pass `shared: true`'),
        }),
      )
    })

    it("reads the project's shared value ahead of the organization's", async () => {
      instance.dispose()
      instance = createSanityInstance({projectId: 'project-1', organizationId: 'org-9'})
      request.mockReturnValue(of({data: [stored(SHARED_KEY, 'compact', 'project')]}))

      await userPreference.resolveState(instance, 'user-1', SHARED_KEY, {shared: true})

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({url: '/projects/project-1/preferences'}),
      )
    })
  })

  describe('project and organization', () => {
    it('fails with a clear error for a project key when there is no project', () => {
      instance.dispose()
      instance = createSanityInstance({})

      expect(() => userPreference.getState(instance, 'user-1', LAYOUT).getCurrent()).toThrow(
        expect.objectContaining({
          code: 'levelNotAllowed',
          message: expect.stringContaining('Pass `projectId`'),
        }),
      )
    })

    it('rejects a change to a project key when there is no project', async () => {
      instance.dispose()
      instance = createSanityInstance({})

      await expect(
        updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: 'compact'}),
      ).rejects.toMatchObject({code: 'levelNotAllowed'})
      await expect(
        updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: undefined}),
      ).rejects.toMatchObject({code: 'levelNotAllowed'})
    })

    it('fails with a clear error for an organization key when there is no organization', () => {
      expect(() =>
        userPreference.getState(instance, 'user-1', ORGANIZATION_KEY).getCurrent(),
      ).toThrow(
        expect.objectContaining({
          code: 'levelNotAllowed',
          message: expect.stringContaining('Pass `organizationId`'),
        }),
      )
    })

    it("uses the Dashboard's organization, ahead of the app's, when the call names none", async () => {
      instance.dispose()
      instance = createSanityInstance({projectId: 'project-1', organizationId: 'org-9'})
      vi.mocked(getDashboardOrganizationId).mockReturnValue({
        getCurrent: () => 'org-dashboard',
      } as ReturnType<typeof getDashboardOrganizationId>)
      request.mockReturnValue(of({data: [stored(ORGANIZATION_KEY, 'x', 'user@organization')]}))

      await userPreference.resolveState(instance, 'user-1', ORGANIZATION_KEY)

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({url: '/organizations/org-dashboard/users/me/preferences'}),
      )
    })

    it('uses the kind of resource the call names, for a key stored in both', async () => {
      instance.dispose()
      instance = createSanityInstance({projectId: 'project-1', organizationId: 'org-9'})
      request.mockReturnValue(of({data: [stored(SHARED_KEY, 'x', 'user@organization')]}))

      await expect(
        userPreference.resolveState(instance, 'user-1', SHARED_KEY, {resourceType: 'organization'}),
      ).resolves.toMatchObject({isDefault: false, shared: false, resourceType: 'organization'})
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({url: '/organizations/org-9/users/me/preferences'}),
      )
    })

    it('fails with a clear error for a kind of resource the key is not stored in', () => {
      expect(() =>
        userPreference
          .getState(instance, 'user-1', LAYOUT, {resourceType: 'organization'})
          .getCurrent(),
      ).toThrow(
        expect.objectContaining({
          code: 'levelNotAllowed',
          message: expect.stringContaining("isn't stored per organization"),
        }),
      )
    })

    it('uses the organization the call names, even for a key also stored per project', async () => {
      request.mockReturnValue(of({data: [stored(SHARED_KEY, 'x', 'user@organization')]}))

      await userPreference.resolveState(instance, 'user-1', SHARED_KEY, {organizationId: 'org-1'})

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({url: '/organizations/org-1/users/me/preferences'}),
      )
    })

    describe('in a Dashboard that has yet to publish its organization', () => {
      let published: string | undefined
      let organization$: Subject<string | undefined>

      beforeEach(() => {
        published = undefined
        organization$ = new Subject()
        vi.mocked(getDashboardMessageBus).mockReturnValue({} as MessageBusConnection)
        vi.mocked(getTopicState).mockReturnValue({
          getCurrent: () => (published ? {id: published} : undefined),
        } as unknown as ReturnType<typeof getTopicState>)
        vi.mocked(getDashboardOrganizationId).mockReturnValue({
          getCurrent: () => published,
        } as ReturnType<typeof getDashboardOrganizationId>)
        vi.mocked(observeAppOrganizationId).mockReturnValue(organization$)
      })

      afterEach(() => {
        vi.mocked(getDashboardMessageBus).mockReset()
      })

      const publish = (id: string) => {
        published = id
        organization$.next(id)
      }

      it('sends a change to a key stored per organization once the organization is known', async () => {
        request.mockReturnValue(of(stored(ORGANIZATION_KEY, 'x', 'user@organization')))

        const saved = updateUserPreference(instance, {
          userId: 'user-1',
          key: ORGANIZATION_KEY,
          value: 'x',
        })
        await Promise.resolve()
        expect(request).not.toHaveBeenCalled()

        publish('org-dashboard')
        await saved

        expect(request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `/organizations/org-dashboard/users/me/preferences/${ORGANIZATION_KEY}`,
          }),
        )
      })

      it('waits only for a key stored per organization that the call names no organization for', () => {
        expect(whenOrganizationKnown(instance, ORGANIZATION_KEY)).toBeInstanceOf(Promise)
        expect(whenOrganizationKnown(instance, SHARED_KEY, {shared: true})).toBeInstanceOf(Promise)
        expect(whenOrganizationKnown(instance, LAYOUT)).toBeUndefined()
        expect(
          whenOrganizationKnown(instance, SHARED_KEY, {resourceType: 'project'}),
        ).toBeUndefined()
        // Its only organization level is the user's own, so its shared value isn't per organization
        expect(whenOrganizationKnown(instance, ORGANIZATION_KEY, {shared: true})).toBeUndefined()
        expect(
          whenOrganizationKnown(instance, ORGANIZATION_KEY, {organizationId: 'org-1'}),
        ).toBeUndefined()

        publish('org-dashboard')

        expect(whenOrganizationKnown(instance, ORGANIZATION_KEY)).toBeUndefined()
      })

      it('rejects a change once the Dashboard says it has no organization, rather than waiting', async () => {
        vi.mocked(getTopicState).mockReturnValue({
          getCurrent: () => null,
        } as unknown as ReturnType<typeof getTopicState>)

        expect(whenOrganizationKnown(instance, ORGANIZATION_KEY)).toBeUndefined()
        await expect(
          updateUserPreference(instance, {
            userId: 'user-1',
            key: ORGANIZATION_KEY,
            value: 'x',
          }),
        ).rejects.toMatchObject({code: 'levelNotAllowed'})
      })
    })

    it("uses the app's organization when there's no Dashboard", async () => {
      instance.dispose()
      instance = createSanityInstance({projectId: 'project-1', organizationId: 'org-9'})
      request.mockReturnValue(of({data: [stored(ORGANIZATION_KEY, 'x', 'user@organization')]}))

      await userPreference.resolveState(instance, 'user-1', ORGANIZATION_KEY)

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({url: '/organizations/org-9/users/me/preferences'}),
      )
    })
  })
})
