import {LoginLinks} from '@sanity/sdk-react/components'
import {useAuthState, useCurrentUser, useLogOut} from '@sanity/sdk-react/hooks'
import {Avatar, Button} from '@sanity/ui'

export function AuthPlayground(): JSX.Element {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const logout = useLogOut()

  return (
    <>
      {authState.type === 'logged-in' ? (
        <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
          <Avatar src={currentUser?.profileImage} color="blue" />{' '}
          <span>Welcome {currentUser?.name}</span>
          <Button onClick={() => logout()}>Logout</Button>
        </div>
      ) : (
        <LoginLinks />
      )}
    </>
  )
}
