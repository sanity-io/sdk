---
'@sanity/sdk-react': patch
---

`useNavigate` no longer passes the Dashboard's echo of an older in-app report to `navigateFn` when the app reports several navigations in quick succession. Under the message bus it tracked only the latest report, so the commit of an earlier one arrived as a Dashboard navigation and pulled the app back to the old page.
