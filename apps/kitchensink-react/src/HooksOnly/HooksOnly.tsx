import {ReactElement} from 'react'
import {styleReset} from 'react95'
/* Original Windows95 font (optional) */
import ms_sans_serif from 'react95/dist/fonts/ms_sans_serif.woff2'
import ms_sans_serif_bold from 'react95/dist/fonts/ms_sans_serif_bold.woff2'
/* Pick a theme of your choice */
import original from 'react95/dist/themes/original'
import {createGlobalStyle, ThemeProvider} from 'styled-components'

import {DocumentListHooksOnly} from './DocumentListHooksOnly/DocumentListHooksOnly'

const GlobalStyles = createGlobalStyle`
  ${styleReset}
  @font-face {
    font-family: 'ms_sans_serif';
    src: url('${ms_sans_serif}') format('woff2');
    font-weight: 400;
    font-style: normal
  }
  @font-face {
    font-family: 'ms_sans_serif';
    src: url('${ms_sans_serif_bold}') format('woff2');
    font-weight: bold;
    font-style: normal
  }
  body, input, select, textarea {
    font-family: 'ms_sans_serif';
  }
`

export const HooksOnly = (): ReactElement => (
  <div>
    <GlobalStyles />
    <ThemeProvider theme={original}>
      <DocumentListHooksOnly />
    </ThemeProvider>
  </div>
)
