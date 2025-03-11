---
title: Working with Suspense
---

# Working with Suspense

Our hooks are optimized for use with [React Suspense](https://react.dev/reference/react/Suspense). This allows you to write code in a synchronous fashion, as if the data you’re requesting from our hooks is available immediately.

For example, note in the example below how we use the value returned by the `useProjects` hook without checking if the request for it is in flight or resolved:

```tsx
// ProjectsList.tsx
import {useProjects} from '@sanity/sdk-react'

import ProjectListItem from './ProjectListItem'

export function ProjectsList() {
  const projects = useProjects()

  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>
          <ProjectListItem projectId={project.id} />
        </li>
      ))}
    </ul>
  )
}
```

## Rendering fallback content

Because our hooks suspend during data fetching, you can render fallback content until data fetching is resolved using Suspense boundaries.

For example, given the above Projects List component (which uses the `useProjects` hook), we can wrap instances of this component with a Suspense boundary as follows:

```tsx
// ProjectsPanel.tsx
import {Suspense} from 'react'

import ProjectsList from './ProjectsList'
import LoadingSkeleton from './LoadingSkeleton'

export function ProjectsPanel() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ProjectsList />
    </Suspense>
  )
}
```

Additionally, if the `ProjectListItem` component made use of the `useProject` hook, we could also wrap its component instances in Suspense boundaries within the `ProjectsList` component:

```tsx
// ProjectsList.tsx
import Suspense from 'react'
import {useProjects} from '@sanity/sdk-react'

import ProjectListItem from './ProjectListItem'

export function ProjectsList() {
  const projects = useProjects()

  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>
          <Suspense fallback={'Loading project…'}>
            <ProjectListItem projectId={project.id} />
          </Suspense>
        </li>
      ))}
    </ul>
  )
}
```

## Notes

- The SanityApp component rendered by all Sanity custom apps comes with a root level Suspense boundary baked in. You can (and should!) pass a fallback component to its `fallback` prop to use as fallback content at the root level of your app. We also recommend wrapping all components that make use of our hooks with further Suspense boundaries, since components using those hooks will fall back to the nearest Suspense boundary in the component tree.
- Our hooks also make use of [`useTransition`](https://react.dev/reference/react/useTransition) internally in order to keep UI that has already been rendered responsive and visible during data fetching.
