import type {JSX} from 'react'
import {Route, Routes} from 'react-router'

import {EditorPlaygroundRoute} from './CollaborativeEditing/EditorPlaygroundRoute'
import {Cosui} from './CosuiSimulator/Cosui'
import Home from './Home'

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/editor-playground" element={<EditorPlaygroundRoute />} />
      <Route index path="/cosui-simulator" element={<Cosui />} />
    </Routes>
  )
}
