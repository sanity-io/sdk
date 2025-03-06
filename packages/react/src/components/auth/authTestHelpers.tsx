import {createSanityInstance} from '@sanity/sdk'
import {render, type RenderResult} from '@testing-library/react'
import React from 'react'

import {SanityProvider} from '../../context/SanityProvider'

const sanityInstance = createSanityInstance({projectId: 'test-project-id', dataset: 'production'})

export const renderWithWrappers = (ui: React.ReactElement): RenderResult => {
  return render(<SanityProvider sanityInstances={[sanityInstance]}>{ui}</SanityProvider>)
}
