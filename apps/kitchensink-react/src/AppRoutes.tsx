import {SanityApp} from '@sanity/sdk-react'
import {Spinner} from '@sanity/ui'
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
import Home from './Home'
import {ProjectAuthHome} from './ProjectAuthentication/ProjectAuthHome'
import {ProjectInstanceWrapper} from './ProjectAuthentication/ProjectInstanceWrapper'
import {ProtectedRoute} from './ProtectedRoute'
import {DashboardContextRoute} from './routes/DashboardContextRoute'
import {DashboardWorkspacesRoute} from './routes/DashboardWorkspacesRoute'
import {UsersRoute} from './routes/UsersRoute'
import {UnauthenticatedHome} from './Unauthenticated/UnauthenticatedHome'
import {UnauthenticatedInstanceWrapper} from './Unauthenticated/UnauthenticatedInstanceWrapper'

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
      <Route path="/" element={<Home />} />

      <Route path="/authenticated" element={<ProjectInstanceWrapper />}>
        <Route
          index
          element={
            <ProjectAuthHome
              routes={[...documentCollectionRoutes, ...dashboardInteractionRoutes]}
            />
          }
        />
        <Route element={<ProtectedRoute subPath="/authenticated" />}>
          {documentCollectionRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Route>
      </Route>

      <Route path="/comlink-demo" element={<ProjectInstanceWrapper />}>
        <Route index element={<ParentApp />} />
        {frameRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Route>

      <Route path="/unauthenticated" element={<UnauthenticatedInstanceWrapper />}>
        <Route
          index
          element={
            <UnauthenticatedHome
              routes={[...documentCollectionRoutes, ...dashboardInteractionRoutes]}
            />
          }
        />
        {documentCollectionRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        {dashboardInteractionRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Route>

      <Route
        path="/sanity-app"
        index
        element={
          <SanityApp config={{projectId: 'ppsg7ml5', dataset: 'test'}} fallback={<Spinner />}>
            <div>Welcome to the Sanity App</div>
          </SanityApp>
        }
      />
    </Routes>
  )
}
