import {SanityApp} from '@sanity/sdk-react/components'
import {type JSX} from 'react'
import {Route, Routes} from 'react-router'

import Framed from './Comlink/Framed'
import ParentApp from './Comlink/ParentApp'
import {DocumentEditorRoute} from './DocumentCollection/DocumentEditorRoute'
import {DocumentGridRoute} from './DocumentCollection/DocumentGridRoute'
import {DocumentListRoute} from './DocumentCollection/DocumentListRoute'
import {GlobalAuthHome} from './GlobalAuthentication/GlobalAuthHome'
import {GlobalInstanceWrapper} from './GlobalAuthentication/GlobalInstanceWrapper'
import Home from './Home'
import {ProjectAuthHome} from './ProjectAuthentication/ProjectAuthHome'
import {ProjectInstanceWrapper} from './ProjectAuthentication/ProjectInstanceWrapper'
import {ProtectedRoute} from './ProtectedRoute'
import {UnauthenticatedHome} from './Unauthenticated/UnauthenticatedHome'
import {UnauthenticatedInstanceWrapper} from './Unauthenticated/UnauthenticatedInstanceWrapper'

const documentCollectionRoutes = [
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
]

const frameRoutes = [1, 2, 3].map((frameNum) => ({
  path: `frame${frameNum}`,
  element: <Framed />,
}))

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/project-auth" element={<ProjectInstanceWrapper />}>
        <Route index element={<ProjectAuthHome routes={documentCollectionRoutes} />} />
        <Route element={<ProtectedRoute subPath="/project-auth" />}>
          {documentCollectionRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Route>
      </Route>

      <Route path="/comlink-demo" element={<GlobalInstanceWrapper />}>
        <Route index element={<ParentApp />} />
        {frameRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Route>

      <Route path="/global-auth" element={<GlobalInstanceWrapper />}>
        <Route index element={<GlobalAuthHome routes={documentCollectionRoutes} />} />
        <Route element={<ProtectedRoute subPath="/global-auth" />}>
          {documentCollectionRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Route>
      </Route>

      <Route path="/unauthenticated" element={<UnauthenticatedInstanceWrapper />}>
        <Route index element={<UnauthenticatedHome routes={documentCollectionRoutes} />} />
        {documentCollectionRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Route>

      <Route
        path="/sanity-app"
        index
        element={
          <SanityApp sanityConfig={{projectId: 'ppsg7ml5', dataset: 'test'}}>
            <div>Welcome to the Sanity App</div>
          </SanityApp>
        }
      />
    </Routes>
  )
}
