/**
 * @thoughtLevel 1 - Where do types actually belong? SDK or types package? How does this play into any OpenAPI generated stuff?
 */
export interface User {
  id: string
  displayName: string
  email: string
  familyName: string | null
  givenName: string | null
  middleName: string | null
  imageUrl: string | null
  provider: string
  createdAt: string
  updatedAt: string
}
