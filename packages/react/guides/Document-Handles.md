---
title: Introducing Document Handles
---

# Introducing Document Handles

Document Handles ({@link DocumentHandle see their type definition here}) are a new concept introduced by the Sanity App SDK, and are important to understand when working with many of the SDK’s React hooks. In this guide, we’ll describe what Document Handles are, why they’re useful, and how to work with them.

## What is a Document Handle?

In short, a Document Handle is a ‘stub’ of a document — a small piece of metadata, encoded in a JavaScript object, that acts as a reference to a complete document in your dataset(s).

It looks like this:

```JavaScript
const myDocumentHandle = {
  _id: 'my-document-id',
  _type: 'article'
}
```

A Document Handle may also contain a resource ID; in that case, it would look like this:

```JavaScript
const myDocumentHandle = {
  _id: 'my-document-id',
  _type: 'author',
  resourceId: `document:${projectId}.${dataset}:${documentId}`
}
```

Therefore, for a document in a given dataset that looks (in part) like this:

```JSON
{
  "_id": "123456-abcdef",
  "_type": "book",
  "title": "Into the Cool",
  "publisher": "The University of Chicago Press",
  "pages": 378,
  "…": "…"
}
```

…the corresponding Document Handle would look like this:

```JavaScript
{
  _id: "123456-abcdef",
  _type: "book"
}
```

## Why are Document Handles used?

Hooks like {@link useDocuments} and {@link usePaginatedDocuments} can return potentially large numbers of documents matching your specified parameters. If these hooks were to return every matching document in its entirety, this could end up being a potentially performance heavy operation, which could thus slow down your application and result in a poor user experience. Additionally, you may not need each returned document in its entirety to begin with — perhaps, for example, you just want to render a document preview, or one or two arbitrary fields of a document, or to simply get a count of documents matching your parameters.

This is where the concept of Document Handles comes in. By returning a small amount of metadata for each document instead of unfurling every returned document, hooks like {@link useDocuments} can respond as fast as possible, allowing your application to remain snappy.

Of course, unless you’re just looking to get a count of documents matching the parameters you pass to these hooks, Document Handles aren't incredibly useful on their own. This is by design — they’re only meant to serve as references to documents which can then be consumed by more specialized hooks, such as {@link useProjection}, {@link useDocument}, and many more hooks provided by the SDK. These specialized hooks are designed to consume document handles and emit only the document content you request, which also delivers huge performance benefits. Other hooks, such as {@link useDocumentEvent} and {@link useDocumentPermissions} have no need to know the contents of a document — instead, they use the provided Document Handle to reference a document and retrieve information pertaining to that document.

In short, Document Handles promote deferring the retrieval of document contents until such time as those contents are actually needed by your application.

## Using your own Document Handles

You’re not limited to using Document Handles returned by hooks like {@link useDocuments} — if it suits your use case (for example: if you know the document ID and type of the document you want to reference), you can certainly write and use your own Document Handles.

For example:

```tsx
import {useDocumentSyncStatus, type DocumentHandle} from '@sanity/sdk-react'

const myDocumentHandle: DocumentHandle = {
  _id: 'my-document-id',
  _type: 'book',
}

const documentSynced = useDocumentSyncStatus(myDocumentHandle)
```

## A quick example

Let’s say you’d like to get all of the documents of type `'author'` from a dataset. In your Sanity application, you could use the {@link useDocuments} hook to do that:

```tsx
import {useDocuments} from '@sanity/sdk'

export function AuthorList() {
  const {data: authors} = useDocuments({filter: '_type: "author"'})
}
```

At this point, the `authors` variable contains an array of Document Handles, which, because we’re filtering for only the `author` content type, will look like this:

```tsx
{ _id: 'the-document-id', _type: 'author' }
```

With this information, we could render the number of authors in the dataset — for example:

```tsx
import {useDocuments} from '@sanity/sdk'

export function AuthorList() {
  const {data: authors} = useDocuments({filter: '_type: "author"'})

  return <p>There are currently {authors.length} authors in our dataset.</p>
}
```

If we wanted to instead render content from each of these documents — for example, the author’s name — we’d then need to pass each Document Handle to a different hook — for example, {@link useProjection}:

```tsx
import {useProjection, type DocumentHandle} from '@sanity/sdk'

interface ProjectionResult {
  results: {
    name: string
  }
}

// The AuthorDetails component will accept a Document Handle for its `document` prop
export function AuthorDetails({document}: {document: DocumentHandle}) {
  const {results}: ProjectionResult = useProjection({
    document,
    projection: '{ name }',
  })

  return <p>The author's name is {results.name}</p>
}
```

We can then use our `AuthorDetails` component with our previously created `AuthorList` component, and pass along the Document Handles to each instance of the `AuthorDetails` component:

```tsx
import {useDocuments} from '@sanity/sdk'

import AuthorDetails from './AuthorDetails.tsx'

export function AuthorList() {
  const { data: authors } = useDocuments({ filter: '_type: "author"'})

  return (
    <>
      <p>There are {authors.length} authors in our dataset! Here they are:</p>
      <ul>
        {authors.map(author => (
          <li key={author._id}>
            <AuthorDetails document={author} />
          </li>
        )}
      </ul>
    </>
  )
}
```

We’ve now both retrieved a list of Document Handles, and used each of them in a dedicated component with a hook that consumes Document Handles. No matter how many authors there are in our dataset, nor how many fields might exist on our author type, this will keep our application performing as fast as possible by separating the concerns of retrieving author type documents (or rather, Document Handles) and retrieving data from those documents.

```

```
