export function isInIframe(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top
}
