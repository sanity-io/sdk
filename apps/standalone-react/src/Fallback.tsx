import {type JSX} from 'react'

export function Fallback(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: 'rgba(128, 128, 128, 0.1)',
        border: '1px dashed rgba(128, 128, 128, 0.6)',
        padding: 12,
        margin: '12px 0',
        borderRadius: 6,
      }}
    >
      Loading…
    </div>
  )
}
