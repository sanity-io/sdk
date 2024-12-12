import {Route, Routes} from 'react-router'

import {AuthPlayground} from './AuthPlayground'
import {DocumentListRoute} from './DocumentCollection/DocumentListRoute'
import {ProtectedRoute} from './ProtectedRoute'

const routes = [
  {
    path: 'document-list',
    element: <DocumentListRoute />,
  },
]

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/" index element={<AuthPlayground routes={routes} />} />
      <Route element={<ProtectedRoute />}>
        {routes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Route>
    </Routes>
  )
}
