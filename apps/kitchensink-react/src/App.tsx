import {studioTheme, ThemeProvider} from '@sanity/ui'
import {testFunction} from 'sdk-core'
import {BrowserRouter, Routes, Route, Link} from 'react-router-dom'
import {PreviewPage} from './pages/PreviewPage'
import {SDKProvider} from 'sdk-react/context/ExampleContext'
import {config} from 'sdk-react/defaultConfig/config'

export function App(): JSX.Element {
  testFunction()
  return (
    <ThemeProvider scheme={'light'} theme={studioTheme}>
      <SDKProvider config={config}>
        <BrowserRouter>
          <div>
            <h1>React Kitchensink</h1>
            <Link to="/preview">Document Previews</Link>
            <Routes>
              <Route path="/preview" element={<PreviewPage />} />
            </Routes>
          </div>
        </BrowserRouter>
      </SDKProvider>
    </ThemeProvider>
  )
}
