export interface LiveEventAwareState {
  lastLiveEventId: string | null
  syncTags: Record<string, true>
}
