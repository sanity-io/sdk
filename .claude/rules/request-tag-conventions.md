---
paths:
  - 'packages/core/src/**/*.ts'
---

# Request tag conventions

All outgoing Sanity API requests from the SDK must use the `sanity.sdk.*` tag namespace for observability.

## How tags work

`@sanity/client` composes the effective tag as `${requestTagPrefix}.${tag}`. The prefix is set when the client is constructed; the tag is set per-request.

## Rules

1. **Do not pass an ad hoc `requestTagPrefix`.** In auth code only, set `requestTagPrefix: resolveRequestTagPrefix(instance.config.requestTagPrefix, 'auth')` using `resolveRequestTagPrefix` from `utils/requestTagPrefix.ts` (producing `'sanity.sdk.auth'`, or `'sanity.sdk.<configured>.auth'` when `config.requestTagPrefix` is set). Everywhere else, omit `requestTagPrefix` so the default from `clientStore.ts` (`'sanity.sdk'`, or `'sanity.sdk.<configured>'`) is applied automatically.
2. **Every `.request()`, `.fetch()`, `.listen()`, and `.action()` call must include a `tag` property** that describes the operation (e.g., `'users.get-current'`, `'logout'`, `'document.action'`).
3. **Tag names should be short, lowercase, dot-separated descriptors** of the operation, not the endpoint path.

## Example

```typescript
// BAD: ad hoc prefix, no request tag
const client = clientFactory({requestTagPrefix: 'my-feature'})
await client.request({url: '/users/me', method: 'GET'})

// GOOD (auth code): resolve the auth prefix from instance config, set an explicit tag
const client = clientFactory({
  requestTagPrefix: resolveRequestTagPrefix(instance.config.requestTagPrefix, 'auth'),
})
await client.request({url: '/users/me', method: 'GET', tag: 'users.get-current'})

// GOOD (non-auth code): omit requestTagPrefix to inherit the default
const client = clientFactory({/* ...other config... */})
await client.request({url: '/users/me', method: 'GET', tag: 'users.get-current'})
```
