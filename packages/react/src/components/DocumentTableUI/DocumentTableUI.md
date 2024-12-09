# DocumentTableUI

The DocumentTableUI component is used to render an index of documents, formatted as a table. Each document in the index is rendered as a row in the table.

![An image of the stock document table component]()

```jsx
<DocumentTableUI documents={documents} />
```

## Installation

```shell
npm install @sanity/sdk
```

```javascript
import DocumentTableUI from `@sanity/sdk/react/DocumentTableUI`
```

## Props

| Name        | Type                       | Description                           |
| ----------- | -------------------------- | ------------------------------------- |
| `documents` | [`DocumentTableItem`](#)[] | The array of documents to be rendered |
