export class DocumentInaccessibleError extends Error {
  constructor(documentId: string) {
    super(`Document with ID \`${documentId}\` is inaccessible due to permissions.`)
    this.name = 'DocumentInaccessibleError'
  }
}
