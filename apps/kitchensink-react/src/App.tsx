import './style.css'

import {CubeIcon, HomeIcon, UlistIcon} from '@sanity/icons'
import {Box, Flex, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {Link, Route, Routes} from 'react-router-dom'
import styled from 'styled-components'

import {CustomDocumentList} from './pages/CustomDocumentList'
import {CustomHook} from './pages/CustomHook'
import Home from './pages/Home'

const Bg = styled(Box)`
  background-color: #f6f6f8;
`

const Ul = styled.ul`
  list-style: none;
`

const theme = buildTheme()

export function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <Flex direction="row" height="fill">
        <Bg padding={4}>
          <Ul>
            <li>
              <Link to="/">
                <HomeIcon fontSize={32} />
              </Link>
            </li>
            <li>
              <Link to="/document-list">
                <UlistIcon fontSize={32} />
              </Link>
            </li>
            <li>
              <Link to="/document-hook">
                <CubeIcon fontSize={32} />
              </Link>
            </li>
          </Ul>
        </Bg>
        <Bg paddingTop={3} flex={1}>
          <Routes>
            <Route path="/" element={<Home />}></Route>
            <Route path="/document-list" element={<CustomDocumentList />}></Route>
            <Route path="/document-hook" element={<CustomHook />}></Route>
          </Routes>
        </Bg>
      </Flex>
    </ThemeProvider>
  )
}
