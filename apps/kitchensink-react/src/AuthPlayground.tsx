import { useCurrentUser, useLoggedInState, useSanityInstance } from "@sanity/sdk-react/hooks"
import { LOGGED_IN_STATES } from "@sanity/sdk"
import { Avatar } from "@sanity/ui"
import { LoginLinks } from "@sanity/sdk-react/components"

export function AuthPlayground(): JSX.Element {
  const sanityInstance = useSanityInstance()
  const currentUser = useCurrentUser(sanityInstance)
  const loggedInState = useLoggedInState(sanityInstance)
  return (
    <>
      {loggedInState === LOGGED_IN_STATES.LOGGED_IN ? (
        <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
          <Avatar src={currentUser?.profileImage} color="blue" />{' '}
          <span>Welcome {currentUser?.name}</span>
        </div>
      ) : (
        <LoginLinks />
      )}
    </>
  )
}