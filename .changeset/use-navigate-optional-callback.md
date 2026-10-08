---
'@sanity/sdk-react': patch
---

`useNavigate` from `@sanity/sdk-react/dashboard` no longer needs a callback. Call `useNavigate()` when your app only sends the user somewhere, and pass a callback when your app has its own router that must follow navigations from the Dashboard.
