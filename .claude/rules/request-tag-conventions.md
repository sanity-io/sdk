---
paths:
  - 'packages/core/src/**/*.ts'
---

# Request tag conventions

All outgoing Sanity API requests from the SDK must use the `sanity.sdk.*` tag namespace for observability.

## How tags work

`@sanity/client` composes the effective tag as `${requestTagPrefix}.${tag}`. The prefix is set when the client is constructed; the tag is set per-request.

## Rules

1. **Do not pass an ad hoc `requestTagPrefix`.** In auth code only, set `requestTagPrefix: REQUEST_TAG_PREFIX` using the constant from `authConstants.ts` (currently `'sanity.sdk.auth'`). Everywhere else, omit `requestTagPrefix` so the default from `clientStore.ts` (`'sanity.sdk'`) is applied automatically.
2. **Every `.request()`, `.fetch()`, `.listen()`, and `.action()` call must include a `tag` property** that describes the operation (e.g., `'users.get-current'`, `'logout'`, `'document.action'`).
3. **Tag names should be short, lowercase, dot-separated descriptors** of the operation, not the endpoint path.

## Example

```typescript
// BAD: ad hoc prefix, no request tag
const client = clientFactory({requestTagPrefix: 'my-feature'})
await client.request({uri: '/users/me', method: 'GET'})

// GOOD (auth code): use the shared constant prefix, set an explicit tag
const client = clientFactory({requestTagPrefix: REQUEST_TAG_PREFIX})
await client.request({uri: '/users/me', method: 'GET', tag: 'users.get-current'})

// GOOD (non-auth code): omit requestTagPrefix to inherit the default
const client = clientFactory({/* ...other config... */})
await client.request({uri: '/users/me', method: 'GET', tag: 'users.get-current'})
```
