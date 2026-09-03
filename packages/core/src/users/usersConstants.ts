// NOTE: currently this API is only available on vX
export const API_VERSION = 'vX'
export const PROJECT_API_VERSION = '2025-07-18'
export const USERS_STATE_CLEAR_DELAY = 5000
export const DEFAULT_USERS_BATCH_SIZE = 100
export const SYSTEM_GROUPS_API_VERSION = 'v2025-05-06'
// Access groups change rarely, so match the five minutes Studio caches them for.
export const SYSTEM_GROUPS_STALE_TIME = 5 * 60 * 1000
export const PROJECT_USER_IDS_PAGE_SIZE = 100
export const PROJECT_USER_IDS_MAX_PAGES = 100
// Much longer than the access groups above, because the trade runs the other
// way. Rebuilding this walks every page of the member list, while a project
// user id never changes once assigned, so the only thing a stale map can get
// wrong is a member who joined since it was built. That case announces itself
// — the member's project membership is there with no id to go with it — and is
// repaired on sight, so there is nothing left for a short window to buy.
export const PROJECT_USER_IDS_STALE_TIME = 60 * 60 * 1000
