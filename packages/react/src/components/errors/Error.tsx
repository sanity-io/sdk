import styles from './Error.styles'

type ErrorProps = {
  heading: string
  description?: string
  code?: string
  cta?: {
    text: string
    href?: string
    onClick?: () => void
  }
}

export function Error({heading, description, code, cta}: ErrorProps): React.ReactNode {
  return (
    <div style={styles['container']}>
      <h1 style={styles['heading']}>{heading}</h1>

      {description && (
        <p style={styles['paragraph']} dangerouslySetInnerHTML={{__html: description}} />
      )}

      {code && <code style={styles['code']}>{code}</code>}

      {cta && (cta.href || cta.onClick) && (
        <p style={styles['paragraph']}>
          {cta.href ? (
            <a style={styles['link']} href={cta.href} target="_blank" rel="noopener noreferrer">
              {cta.text}
            </a>
          ) : (
            <button style={styles['link']} onClick={cta.onClick}>
              {cta.text}
            </button>
          )}
        </p>
      )}
    </div>
  )
}
