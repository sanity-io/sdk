# DocumentList Component

The DocumentList component is used to render an index of documents, formatted as a list. Each document in the list is rendered with a [DocumentPreview component](#).

The document list can be formatted as a traditional vertical list, or as a two dimensional grid layout.

![An image of the stock document list component]()

```jsx
<DocumentList documents={documents} layout="vertical" />
```

## Installation

```shell
npm install @sanity/sdk
```

```javascript
import { DocumentList } from `@sanity/sdk/react/DocumentList`
```

## Props

| Name        | Type                            | Description                                             |
| ----------- | ------------------------------- | ------------------------------------------------------- |
| `documents` | [`DocumentPreviewProps`](#)`[]` | The array of documents to be rendered                   |
| `layout`    | `'list' \| 'grid'`              | The layout algorithm for the list; defaults to `'list'` |
