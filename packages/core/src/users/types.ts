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
  /**
   * The user's id within this resource, distinct from the account-wide
   * `sanityUserId`. Only projects have one, and it is what a dataset's access
   * groups list as their members.
   */
  resourceUserId?: string
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
  userId?: string
  /** Narrows to users whose display name contains this, ignoring case. */
  displayName?: string
  /**
   * Narrows to users whose email contains this, ignoring case. Combined with
   * `displayName` it narrows to users matching both, not either.
   */
  email?: string
  /** The only field the API can sort on. */
  sortBy?: 'displayName'
  /** @defaultValue 'asc', when `sortBy` is set */
  orderBy?: 'asc' | 'desc'
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

/**
 * @public
 */
export interface GetUserOptions extends ProjectHandle {
  userId: string
  resourceType?: 'organization' | 'project'
  organizationId?: string
}

/**
 * @public
 */
export interface ResolveUserOptions extends GetUserOptions {
  signal?: AbortSignal
}
