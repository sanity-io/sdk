import {type JSX} from 'react'
import {Route, Routes} from 'react-router'

import Framed from './Comlink/Framed'
import ParentApp from './Comlink/ParentApp'
import {DocumentDashboardInteractionsRoute} from './DocumentCollection/DocumentDashboardInteractionsRoute'
import {DocumentEditorRoute} from './DocumentCollection/DocumentEditorRoute'
import {DocumentGridRoute} from './DocumentCollection/DocumentGridRoute'
import {DocumentListRoute} from './DocumentCollection/DocumentListRoute'
import {DocumentProjectionRoute} from './DocumentCollection/DocumentProjectionRoute'
import {MultiResourceRoute} from './DocumentCollection/MultiResourceRoute'
import {SearchRoute} from './DocumentCollection/SearchRoute'
import {ProjectAuthHome} from './ProjectAuthentication/ProjectAuthHome'
import {ProtectedRoute} from './ProtectedRoute'
import {DashboardContextRoute} from './routes/DashboardContextRoute'
import {DashboardWorkspacesRoute} from './routes/DashboardWorkspacesRoute'
import {UsersRoute} from './routes/UsersRoute'

const documentCollectionRoutes = [
  {
    path: 'users',
    element: <UsersRoute />,
  },
  {
    path: 'document-list',
    element: <DocumentListRoute />,
  },
  {
    path: 'document-grid',
    element: <DocumentGridRoute />,
  },
  {
    path: 'document-editor',
    element: <DocumentEditorRoute />,
  },
  {
    path: 'multi-resource',
    element: <MultiResourceRoute />,
  },
  {
    path: 'search',
    element: <SearchRoute />,
  },
  {
    path: 'document-projection',
    element: <DocumentProjectionRoute />,
  },
  {
    path: 'document-dashboard-interactions',
    element: <DocumentDashboardInteractionsRoute />,
  },
  {
    path: 'dashboard-context',
    element: <DashboardContextRoute />,
  },
]

const dashboardInteractionRoutes = [
  {
    path: 'workspaces',
    element: <DashboardWorkspacesRoute />,
  },
]

const frameRoutes = [1, 2, 3].map((frameNum) => ({
  path: `frame${frameNum}`,
  element: <Framed />,
}))

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/">
        <Route element={<ProtectedRoute subPath="/" />}>
          <Route
            index
            element={
              <ProjectAuthHome
                routes={[
                  ...documentCollectionRoutes,
                  ...dashboardInteractionRoutes,
                  {
                    path: 'comlink-demo',
                    element: <ParentApp />,
                  },
                ]}
              />
            }
          />
          {documentCollectionRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          <Route path="comlink-demo" element={<ParentApp />} />
        </Route>
        <Route path="comlink-demo">
          {frameRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Route>
      </Route>
    </Routes>
  )
}
