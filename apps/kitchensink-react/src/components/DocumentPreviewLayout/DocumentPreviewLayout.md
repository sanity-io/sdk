# DocumentPreviewLayout

The DocumentPreviewLayout component is used to render a compact representation of a [document](#). These previews are often rendered for each document within a [DocumentListUI component](#), but can also be rendered as standalone components.

Document previews surface the following information about each document:

- The document's title
- A subtitle (optional)
- A piece of media, such as an icon or image (optional)
- The document type (optional)
- The document’s state, such as draft or published (optional)

Additionally, each document preview can take a `url` prop to enable navigation changes when selecting the document, and a `selected` prop to indicate that a given document has been selected.

![An image of the stock preview component]()

```jsx
<DocumentPreviewLayout
  title={doc.title}
  subtitle={doc.subtitle}
  media={doc.media}
  docType={doc.type}
  docState={doc.published ? 'published' : 'draft'}
  url={doc.url}
  selected={true}
/>
```

## Installation

```shell
npm install @sanity/sdk
```

```javascript
import DocumentPreviewLayout from `@sanity/sdk/react/DocumentPreviewLayout`
```

## Props

| Name       | Type                 | Description                                                 |
| ---------- | -------------------- | ----------------------------------------------------------- |
| `title`    | `string`             | The title to display for the document                       |
| `subtitle` | `string` (optional)  | The subtitle to display for the document                    |
| `media`    | `node` (optional)    | The image, icon, or other node to display with the document |
| `docType`  | `string` (optional)  | The document type                                           |
| `docState` | `string` (optional)  | The state of the document, such as 'published' or 'draft'   |
| `url`      | `string` (optional)  | The URL to navigate to when selecting the document          |
| `selected` | `boolean` (optional) | The `selected` state of the document; defaults to `false`   |
