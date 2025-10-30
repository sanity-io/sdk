import {type ResourceHandle, useIntentLink} from '../hooks/dashboard/useIntentLink'

export type IntentLinkProps = {
  resourceHandle: ResourceHandle
  params?: Record<string, string>
} & (
  | (Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
      intentName?: undefined
      intentCategory?: string
    })
  | (Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & {
      intentName: string
      intentCategory?: undefined
    })
)

/**
 * IntentLink
 * @public
 */
export function IntentLink({
  intentCategory,
  resourceHandle,
  params,
  children,
  ...props
}: IntentLinkProps): React.ReactNode {
  const {href, onClick} = useIntentLink({
    intentName: props.intentName,
    intentCategory,
    resourceHandle,
    params,
  })

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) {
      return
    }

    e.preventDefault()
    onClick()
  }

  if (props.intentName) {
    const {intentName: _intentName, ...anchorProps} = props

    return (
      <a href={href} onClick={handleClick} {...anchorProps}>
        {children}
      </a>
    )
  }

  if (props.intentName === undefined) {
    const {intentName: _intentName, ...buttonProps} = props

    return (
      <button onClick={onClick} {...buttonProps}>
        {children}
      </button>
    )
  }

  return null
}
