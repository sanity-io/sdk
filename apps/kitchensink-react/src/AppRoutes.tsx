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
import {OrgDocumentExplorerRoute} from './DocumentCollection/OrgDocumentExplorerRoute'
import {SearchRoute} from './DocumentCollection/SearchRoute'
import {PresenceRoute} from './Presence/PresenceRoute'
import {ProjectAuthHome} from './ProjectAuthentication/ProjectAuthHome'
import {ProtectedRoute} from './ProtectedRoute'
import {DashboardContextRoute} from './routes/DashboardContextRoute'
import {DashboardWorkspacesRoute} from './routes/DashboardWorkspacesRoute'
import ExperimentalResourceClientRoute from './routes/ExperimentalResourceClientRoute'
import {ProjectsRoute} from './routes/ProjectsRoute'
import {ReleasesRoute} from './routes/releases/ReleasesRoute'
import {UserDetailRoute} from './routes/UserDetailRoute'
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
    path: 'org-document-explorer',
    element: <OrgDocumentExplorerRoute />,
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
  {
    path: 'experimental-resource-client',
    element: <ExperimentalResourceClientRoute />,
  },
  {
    path: 'presence',
    element: <PresenceRoute />,
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
                  {
                    path: 'releases',
                    element: <ReleasesRoute />,
                  },
                  {
                    path: 'projects',
                    element: <ProjectsRoute />,
                  },
                ]}
              />
            }
          />
          {documentCollectionRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          <Route path="users/:userId" element={<UserDetailRoute />} />
          <Route path="comlink-demo" element={<ParentApp />} />
          <Route path="releases" element={<ReleasesRoute />} />
          <Route path="projects" element={<ProjectsRoute />} />
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
