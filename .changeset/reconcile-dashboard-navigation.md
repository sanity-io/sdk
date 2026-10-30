---
'@sanity/sdk-react': patch
---

`useNavigate` keeps the app's router at the location the Dashboard committed for it. The app now also follows back and forward navigations, and navigations the Dashboard made while the app was in the background.
