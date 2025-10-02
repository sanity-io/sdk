import './ExampleComponent.css'

import {type CurrentUser, useCurrentUser} from '@sanity/sdk-react'
import React from 'react'

export function ExampleComponent(): React.JSX.Element {
  const user: CurrentUser | null = useCurrentUser()

  return (
    <div className="example-container">
      {user?.profileImage ? (
        <div className="example-avatar-container">
          <img src={user.profileImage} alt="" className="example-avatar" />
        </div>
      ) : (
        ''
      )}
      <h1 className="example-heading">
        Welcome to your Sanity App{user?.name ? `, ${user.name}` : ''}!
      </h1>
      <p className="example-text">
        This is an example component. You can replace this with your own content by creating a new
        component and importing it in App.tsx.
      </p>
      <div className="code-hint">
        <p>
          Quick tip: Create new components in separate files and import them like this in App.tsx /
          App.jsx:
        </p>
        <pre>{`import {YourComponent} from './YourComponent'

// Then use it in your JSX
<SanityApp config={sanityConfigs}>
  <YourComponent />
</SanityApp>`}</pre>
      </div>
    </div>
  )
}
