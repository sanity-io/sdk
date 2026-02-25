export function insecureRandomId(): string {
  return Array.from({length: 16}, () => Math.floor(Math.random() * 16).toString(16)).join('')
}
