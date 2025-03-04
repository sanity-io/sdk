/**
 * @public
 */
export type ResourceType = 'organization' | 'project'

/**
 * @public
 */
export interface SanityUser {
  sanityUserId: string
  profile: UserProfile
  memberships: Membership[]
}

/**
 * @public
 */
interface Membership {
  addedAt?: string
  resourceType: string
  resourceId: string
  roleNames: Array<string>
  lastSeenAt?: string | null
}

/**
 * @public
 */
interface UserProfile {
  id: string
  displayName: string
  email: string
  familyName?: string
  givenName?: string
  middleName?: string | null
  imageUrl?: string
  provider: string
  tosAcceptedAt?: string
  createdAt: string
  updatedAt?: string
  isCurrentUser?: boolean
  providerId?: string
}
