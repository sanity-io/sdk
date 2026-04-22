# @sanity/standalone-react

A minimal example of using `@sanity/sdk-react` in a plain React app, outside
the Sanity Dashboard and without a Sanity Studio. Pairs with
`apps/kitchensink-react`, which covers the Studio/Dashboard-embedded story.

This app:

- Uses `SDKProvider` directly (not `SanityApp`).
- Has no Sanity Studio, no Dashboard iframe, no extra UI libraries.
- Exercises the `standalone` branch of `resolveAuthMode` (no `_context` query
  param, not inside an iframe).
- Ships a small set of auth dev tools (expire token, clear token, live auth
  state readout) for exercising login, logout, and error flows without having
  to wait for a real token to expire.

The configs in `src/sanityConfigs.ts` mirror
`apps/kitchensink-react/src/sanityConfigs.ts` `devConfigs` so both apps point
at the same projects.

## Run it

```bash
pnpm --filter @sanity/standalone-react dev
```

Then open http://localhost:3334.

On first load the SDK will send you to `www.sanity.io/login` and bring you
back with a stored token in `localStorage.__sanity_auth_token`. After that,
`CurrentUserCard` shows your authenticated user and the current auth state.

## Auth dev tools

- **Expire token**: overwrites `localStorage.__sanity_auth_token` with a
  stamped-looking but unauthorized value and reloads. The SDK treats it as a
  stored session, so the next authenticated request 401s. Handy for poking at
  the auth error / re-login paths.
- **Clear token and reload**: removes the stored token and reloads, which
  takes you through the standalone login redirect.
- **`/?expire`**: same as clicking "Expire token", but seeds the bad token
  before the SDK mounts. Useful for repros where the app must boot into a
  pre-expired state.
