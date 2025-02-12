export function getPublishedId(id: string): string {
  const draftsPrefix = 'drafts.'
  return id.startsWith(draftsPrefix) ? id.slice(draftsPrefix.length) : id
}

export function getDraftId(id: string): string {
  const draftsPrefix = 'drafts.'
  return id.startsWith(draftsPrefix) ? id : `${draftsPrefix}${id}`
}

export function insecureRandomId(): string {
  return Array.from({length: 16}, () => Math.floor(Math.random() * 16).toString(16)).join('')
}
