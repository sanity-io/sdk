---
title: About SDK Core
---

# About SDK Core

The SDK Core package contains all the business logic that powers the Sanity App SDK (including our React hooks).

The SDK Core is written in Typescript, which opens the possibility for providing other framework implementations for the Sanity App SDK beyond just React in the future. For now, our primary focus is on our React implementation.

We highly recommend that users default to using the hooks provided by the React SDK for building custom apps on the Sanity platform. However, should your application require the use of an export provided by the SDK Core, you do not need to install this package separately. **All members of the SDK Core are re-exported from `@sanity/sdk-react` in order to keep dependency management simple.**

Should you wade into these reference docs, please note that the SDK Core is not currently documented to the same extent that our React SDK is, as these exports are provided primarily for developers building their own Sanity App development kit.
