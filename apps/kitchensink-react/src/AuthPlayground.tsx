import {LoginLinks} from '@sanity/sdk-react/components'
import {useAuthState} from '@sanity/sdk-react/hooks'

export function AuthPlayground(): JSX.Element {
  const authState = useAuthState()
  // const currentUser = useCurrentUser(sanityInstance)

  return (
    <>
      {authState === 'logged-in' ? (
        <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
          {/* <Avatar src={currentUser?.profileImage} color="blue" />{' '}
          <span>Welcome {currentUser?.name}</span> */}
          <span>Welcome, you are logged in</span>
        </div>
      ) : (
        <LoginLinks />
      )}
    </>
  )
}
