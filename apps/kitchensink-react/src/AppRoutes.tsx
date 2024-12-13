import {Route, Routes} from 'react-router'

import CosuiSimHome from './CosuiSimulator/CosuiSimHome'
import {DocumentGridRoute} from './DocumentCollection/DocumentGridRoute'
import {DocumentListRoute} from './DocumentCollection/DocumentListRoute'
import Home from './Home'
import {OrgAuthHome} from './OrgAuthentication/OrgAuthHome'
import {OrgInstanceWrapper} from './OrgAuthentication/OrgInstanceWrapper'
import {ProjectAuthHome} from './ProjectAuthentication/ProjectAuthHome'
import {ProjectInstanceWrapper} from './ProjectAuthentication/ProjectInstanceWrapper'
import {HooksOnly} from './HooksOnly/HooksOnly'
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
    path: 'hooks-only',
    element: <HooksOnly />,
  },
]

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
      <Route path="/org-auth" element={<OrgInstanceWrapper />}>
        <Route index element={<OrgAuthHome routes={documentCollectionRoutes} />} />
        <Route element={<ProtectedRoute subPath="/org-auth" />}>
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
      <Route path="/cosui-simulator" element={<CosuiSimHome />} />
    </Routes>
  )
}
