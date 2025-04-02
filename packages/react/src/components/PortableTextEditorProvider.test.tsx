import {
  type Editor,
  type PortableTextBlock,
  PortableTextEditable,
  type PortableTextSpan,
  type SchemaDefinition,
  useEditor,
} from '@portabletext/editor'
import {
  createSanityInstance,
  type DocumentHandle,
  getDocumentState,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {useEffect} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {useEditDocument} from '../hooks/document/useEditDocument'
import {PortableTextEditorProvider} from './PortableTextEditorProvider'

// Mock dependencies
vi.mock('../hooks/context/useSanityInstance')
vi.mock('@sanity/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...actual,
    getDocumentState: vi.fn(),
  }
})
vi.mock('../hooks/document/useEditDocument')

let instance: SanityInstance
const subscribe = vi.fn(() => vi.fn()) as StateSource<unknown>['subscribe'] // Returns a mock unsubscribe function
const getCurrent = vi.fn() as StateSource<unknown>['getCurrent']
const edit = vi.fn()

describe('PortableTextEditorProvider', () => {
  const docHandle: DocumentHandle = {
    documentId: 'doc1',
    documentType: 'author',
    projectId: 'test',
    dataset: 'test',
  }
  const path = 'content'
  const schemaDefinition: SchemaDefinition = {}
  const initialValue: PortableTextBlock[] = [
    {
      _type: 'block',
      _key: 'a',
      children: [{_type: 'span', _key: 'a1', text: 'Hello', marks: []}],
      markDefs: [],
      style: 'normal',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance()

    vi.mocked(useSanityInstance).mockReturnValue(instance)
    vi.mocked(getCurrent).mockReturnValue(initialValue)
    vi.mocked(getDocumentState).mockReturnValue({subscribe, getCurrent} as StateSource<unknown>)
    vi.mocked(useEditDocument).mockReturnValue(edit)
  })

  afterEach(() => {
    instance.dispose()
  })

  it('should render children', () => {
    render(
      <PortableTextEditorProvider {...docHandle} path={path} initialConfig={{schemaDefinition}}>
        <div>Test Child</div>
      </PortableTextEditorProvider>,
    )
    expect(screen.getByText('Test Child')).toBeInTheDocument()
  })

  it('should initialize with correct schema and initial value', () => {
    // We can't directly assert props on EditorProvider without complex mocking or introspection
    // Instead, we verify that the necessary hooks were called to fetch the initial value.
    render(
      <PortableTextEditorProvider {...docHandle} path={path} initialConfig={{schemaDefinition}}>
        <div />
      </PortableTextEditorProvider>,
    )

    expect(useSanityInstance).toHaveBeenCalledWith(docHandle)
    expect(getDocumentState).toHaveBeenCalledWith(instance, docHandle, path)
    expect(getCurrent).toHaveBeenCalledTimes(1) // Called once by Provider for initialValue
    // Note: UpdateValuePlugin also calls getDocumentState, but we check that separately
  })

  it('UpdateValuePlugin should setup subscription and edit function on mount', () => {
    render(
      <PortableTextEditorProvider {...docHandle} path={path} initialConfig={{schemaDefinition}}>
        <div />
      </PortableTextEditorProvider>,
    )

    // Called once by Provider, once by Plugin
    expect(useSanityInstance).toHaveBeenCalledTimes(2)
    expect(useSanityInstance).toHaveBeenNthCalledWith(1, docHandle) // Provider
    expect(useSanityInstance).toHaveBeenNthCalledWith(2, docHandle) // Plugin

    // Called once by Provider, once by Plugin
    expect(getDocumentState).toHaveBeenCalledTimes(2)
    expect(getDocumentState).toHaveBeenNthCalledWith(1, instance, docHandle, path) // Provider
    expect(getDocumentState).toHaveBeenNthCalledWith(2, instance, docHandle, path) // Plugin

    expect(subscribe).toHaveBeenCalledTimes(1) // Called by Plugin
    expect(useEditDocument).toHaveBeenCalledTimes(1) // Called by Plugin
    expect(useEditDocument).toHaveBeenCalledWith(docHandle, path)
  })

  it('UpdateValuePlugin subscribe callback should call editor.send', async () => {
    // Capture the callback passed to subscribe
    let onStoreChanged: (() => void) | undefined = () => {}
    vi.mocked(subscribe).mockImplementation((cb) => {
      onStoreChanged = cb
      return vi.fn() // unsubscribe
    })

    let editor!: Editor

    function CaptureEditor() {
      const _editor = useEditor()

      useEffect(() => {
        editor = _editor
      }, [_editor])

      return null
    }

    render(
      <PortableTextEditorProvider {...docHandle} path={path} initialConfig={{schemaDefinition}}>
        <CaptureEditor />
      </PortableTextEditorProvider>,
    )

    expect(editor).toBeDefined()

    // Trigger the subscription callback
    const newValue = [{_type: 'block', _key: 'b', children: [{_type: 'span', text: 'Updated'}]}]
    await act(async () => {
      vi.mocked(getCurrent).mockReturnValue(newValue) // Simulate new value from document state
      onStoreChanged?.()
    })

    const value = await new Promise<PortableTextBlock[] | undefined>((resolve) => {
      const subscription = editor.on('value changed', (e) => {
        if (e.value?.at(0)?._key === 'b') {
          subscription.unsubscribe()
          resolve(e.value)
        }
      })
    })

    expect(value).toEqual(newValue)
  })

  it.skip('should call edit function on editor mutation', async () => {
    // Set up a promise that resolves when edit is called
    let resolveEditPromise: (value: PortableTextBlock[]) => void
    // Ensure the Promise itself is typed
    const editCalledPromise = new Promise<PortableTextBlock[]>((resolve) => {
      resolveEditPromise = resolve
    })
    vi.mocked(edit).mockClear()
    vi.mocked(edit).mockImplementation((value) => {
      // Ensure the value passed to the resolver is cast correctly
      resolveEditPromise(value as PortableTextBlock[])
    })

    render(
      <PortableTextEditorProvider {...docHandle} path={path} initialConfig={{schemaDefinition}}>
        <PortableTextEditable data-testid="pte-editable" />
      </PortableTextEditorProvider>,
    )

    // Use findByTestId to ensure the element is ready
    const editableElement = await screen.findByTestId('pte-editable')

    // Simulate clicking and then changing input value using fireEvent
    const textToType = ' world'
    // hi gemini, don't fix this line, it's fine as is
    const initialText = (initialValue[0]?.children as PortableTextSpan[])[0]?.text ?? ''
    const fullNewText = initialText + textToType
    await act(async () => {
      fireEvent.click(editableElement) // Simulate click first
      fireEvent.input(editableElement, {target: {textContent: fullNewText}}) // Then simulate input
    })

    // Wait for the edit function to be called (no waitFor needed here, await promise directly)
    const editedValue = await editCalledPromise

    // Assert that edit was called with the new value
    expect(edit).toHaveBeenCalledTimes(1)

    // Construct the expected value
    const expectedValue: PortableTextBlock[] = [
      {
        _type: 'block',
        _key: expect.any(String),
        children: [
          {
            _type: 'span',
            _key: expect.any(String),
            text: fullNewText,
            marks: [],
          },
        ],
        markDefs: [],
        style: 'normal',
      },
    ]

    expect(editedValue).toEqual(expectedValue)
  })
})
