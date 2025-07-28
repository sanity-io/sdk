import {type JSX} from 'react'
import {Route, Routes} from 'react-router'

import Maintenance from './Maintenance'
import PropertyList from './PropertyList'

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<PropertyList />} />
      <Route path="/property/:propertyId" element={<Maintenance />} />
    </Routes>
  )
}
