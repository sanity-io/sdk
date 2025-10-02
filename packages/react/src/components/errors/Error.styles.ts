const FONT_SANS_SERIF = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif`
const FONT_MONOSPACE = `-apple-system-ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace`

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '28px',
    fontFamily: FONT_SANS_SERIF,
    display: 'flex',
    flexDirection: 'column',
    gap: '21px',
    fontSize: '14px',
  },
  heading: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 700,
  },
  paragraph: {
    margin: 0,
  },
  link: {
    appearance: 'none',
    background: 'transparent',
    border: 0,
    padding: 0,
    font: 'inherit',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  code: {
    fontFamily: FONT_MONOSPACE,
  },
}

export default styles
