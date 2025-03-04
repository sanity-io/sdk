import {describe, expect, it, vi} from 'vitest'

import {type SanityInstance} from '../instance/types'
import {createStore, type StoreActionContext} from './createStore'

// Mock the devtools middleware
vi.mock('zustand/middleware', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  devtools: (storeFunction: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (...args: any[]) => storeFunction(...args)
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createStore', () => {
  // Setup mock instance
  const mockInstance = {
    resources: [{id: 'test-id'}],
  } as SanityInstance

  // Setup types for our test store
  interface TestState {
    count: number
    text: string
  }

  const initialState: TestState = {
    count: 0,
    text: '',
  }

  // Setup test actions
  const createTestActions = () => ({
    increment: ({store}: StoreActionContext<TestState>) => {
      const state = store.getState()
      store.setState({...state, count: state.count + 1})
    },
    setText: ({store}: StoreActionContext<TestState>, newText: string) => {
      const state = store.getState()
      store.setState({...state, text: newText})
      return newText
    },
    getCount: ({store}: StoreActionContext<TestState>) => {
      return store.getState().count
    },
    getText: ({store}: StoreActionContext<TestState>) => {
      return store.getState().text
    },
  })

  it('creates a store with initial state with all properties', () => {
    const actions = createTestActions()
    const store = createStore(initialState, actions, {
      name: 'test-store',
      instance: mockInstance,
    })

    // Verify store has all action methods
    expect(store).toHaveProperty('increment')
    expect(store).toHaveProperty('setText')
    expect(store).toHaveProperty('getCount')
  })

  it('maintains separate state for different stores', () => {
    const actions = createTestActions()
    const store1 = createStore(initialState, actions, {
      name: 'store-1',
      instance: mockInstance,
    })
    const store2 = createStore(initialState, actions, {
      name: 'store-2',
      instance: mockInstance,
    })

    store1.increment()
    store2.setText('hello')

    // Verify stores are unaffected
    expect(store1.getCount()).toBe(1)
    expect(store2.getCount()).toBe(0)

    expect(store1.getText()).toBe('')
    expect(store2.getText()).toBe('hello')
  })

  it('correctly updates state through actions', () => {
    const actions = createTestActions()
    const store = createStore(initialState, actions, {
      name: 'test-store',
      instance: mockInstance,
    })

    store.increment()
    expect(store.getCount()).toBe(1)

    store.increment()
    expect(store.getCount()).toBe(2)

    store.setText('hello world')
    expect(store.getText()).toBe('hello world')
  })
})
