---
'@sanity/sdk': patch
---

Include runtime context in session and hook telemetry, and include the session auth method in hook-mounted and session-ended events. This lets analytics segment Studio and app usage independently of credential source while retaining both populations.
