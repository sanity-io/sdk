import {renderHook} from '@testing-library/react'
import {type ComponentProps, type ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

import {getDashboardRootContext} from '../../dashboard/module'
import {useAssetSource} from './useAssetSource'

const RootContext = getDashboardRootContext()
const signal = new AbortController().signal
const base = {
  id: 'notes-library',
  moduleId: 'views/library',
  name: 'library',
  title: 'Library',
  version: '2',
}

function renderInView(value: ComponentProps<typeof RootContext.Provider>['value']) {
  return renderHook(() => useAssetSource(), {
    wrapper: ({children}: {children: ReactNode}) => (
      <RootContext.Provider value={value}>{children}</RootContext.Provider>
    ),
  })
}

describe('useAssetSource', () => {
  it('returns the asset source view and props the host passed to render()', () => {
    const view = {...base, metadata: null, type: 'asset_source'} as const
    const props: ReturnType<typeof useAssetSource> = {
      accept: 'image/*',
      assetSource: {component: () => null, name: 'library'},
      onClose: vi.fn(),
      onSelect: vi.fn(),
      selectedAssets: [],
      selectionType: 'single',
      view,
    }

    const {result} = renderInView({signal, viewType: 'asset_source', props})

    expect(result.current).toBe(props)
  })

  it('throws in a view of another type', () => {
    const view = {...base, metadata: {size: 'small'}, type: 'tile'} as const

    expect(() => renderInView({signal, viewType: 'tile', props: {view}})).toThrow(
      'useAssetSource must be called inside an asset source view, not a tile view',
    )
  })
})
