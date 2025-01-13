import {type JSX} from 'react'
import {Route, Routes} from 'react-router'

import {Cosui} from './CosuiSimulator/Cosui'
import Home from './Home'

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route index path="/cosui-simulator" element={<Cosui />} />
    </Routes>
  )
}
