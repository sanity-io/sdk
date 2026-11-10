import {ClientError, type SanityClient} from '@sanity/client'
import {of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {getDashboardOrganizationId} from '../dashboard/messageBus/topicStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {updateUserPreference, userPreference} from './preferences'
import {type PreferenceEdit, type PreferenceKey} from './registry'

vi.mock('../client/clientStore')

vi.mock('../dashboard/messageBus/topicStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dashboard/messageBus/topicStore')>()),
  getDashboardOrganizationId: vi.fn(() => ({getCurrent: () => undefined})),
}))

// No declared key is stored per organization yet, so the tests declare one
vi.mock('./registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./registry')>()
  return {
    ...actual,
    lookUpKey: (key: string) =>
      key === 'test.organization-key'
        ? {resourceType: 'organization', defaultValue: 'none'}
        : actual.lookUpKey(key),
  }
})

const ORGANIZATION_KEY = 'test.organization-key' as PreferenceKey
const LAYOUT = 'studio.structure-tool.layout.book'
const PATH = '/projects/project-1/users/me/preferences'

const stored = (key: string, activeValue: unknown, activeLevel = 'user@project') => ({
  key,
  activeValue,
  activeLevel,
})

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
      request.mockReturnValue(of({data: [stored(LAYOUT, 'compact')]}))
      await userPreference.resolveState(instance, 'user-1', LAYOUT)
      instance.dispose()
      instance = createSanityInstance({projectId: 'project-1', dataset: 'production'})
      const read = new Subject<{data: unknown[]}>()
      request.mockReturnValue(read)

      const source = userPreference.getState(instance, 'user-1', LAYOUT)
      const unsubscribe = source.subscribe()

      expect(source.getCurrent()).toMatchObject({status: 'success', data: {value: 'compact'}})
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
      request.mockReturnValue(new Subject())
      const flip = (current: string) => (current === 'compact' ? 'detail' : 'compact')

      void updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: flip})
      void updateUserPreference(instance, {userId: 'user-1', key: LAYOUT, value: flip})

      expect(request).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({method: 'PUT', body: {value: 'compact'}}),
      )
      expect(request).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({method: 'PUT', body: {value: 'detail'}}),
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
      request.mockReturnValueOnce(of({data: [stored(FAVORITES, favorites(...refs), 'user')]}))
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
