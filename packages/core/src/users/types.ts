import {type ProjectHandle} from '../config/sanityConfig'

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
export interface Membership {
  addedAt?: string
  resourceType: string
  resourceId: string
  roleNames: Array<string>
  lastSeenAt?: string | null
}

/**
 * @public
 */
export interface UserProfile {
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

/**
 * @public
 */
export interface GetUsersOptions extends ProjectHandle {
  resourceType?: 'organization' | 'project'
  batchSize?: number
  organizationId?: string
}

/**
 * @public
 */
export interface UsersGroupState {
  subscriptions: string[]
  totalCount?: number
  nextCursor?: string | null
  lastLoadMoreRequest?: string
  users?: SanityUser[]
  error?: unknown
}

/**
 * @public
 */
export interface SanityUserResponse {
  data: SanityUser[]
  totalCount: number
  nextCursor: string | null
}

/**
 * @public
 */
export interface UsersStoreState {
  users: {[TUsersKey in string]?: UsersGroupState}
  error?: unknown
}

/**
 * @public
 */
export interface ResolveUsersOptions extends GetUsersOptions {
  signal?: AbortSignal
}
