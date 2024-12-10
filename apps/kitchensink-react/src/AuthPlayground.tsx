import {LoginLinks} from '@sanity/sdk-react/components'
import {useAuthState, useCurrentUser} from '@sanity/sdk-react/hooks'
import {Avatar} from '@sanity/ui'

export function AuthPlayground(): JSX.Element {
  const authState = useAuthState()
  const currentUser = useCurrentUser()

  return (
    <>
      {authState.type === 'logged-in' ? (
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
