# SDK Authentication Guide

This document outlines the various authentication mechanisms supported by the Sanity SDK, catering to different usage contexts like embedded dashboard apps, Studio integrations, and standalone applications.

## ✨ High-Level Overview

Authentication in the SDK is primarily managed by the `authStore`, which tracks the user's authentication state (`LoggedIn`, `LoggedOut`, `LoggingIn`, `Error`). It determines the initial state based on the environment (Dashboard iframe, Studio mode, presence of a provided token, or auth callback URL parameters).

API client instances, managed by `clientStore`, automatically utilize the current authentication token from `authStore` for making requests. The `clientStore` also handles differentiating between clients configured for 'global' endpoints (like `api.sanity.io`) and 'default' (project-specific) endpoints (like `<projectId>.api.sanity.io`).

The primary interactive authentication flow involves redirecting the user to `sanity.io/login` (or `sanity.work/login` for staging environments) and handling the callback, which returns an `authCode` (`sid`) exchanged for a session token.

### Authentication Channels Overview

- **Dashboard (Primary):** Relies on the host environment providing
  authentication context (`sid`) via URL parameters. Seamless for the end-user.
  This mechanism applies to both third-party Sanity Apps and internal Sanity
  applications (e.g., Canvas, Media Library).

- **Studio Mode:** Leverages Studio's own auth context (token or cookie)
  when the SDK is used within the Studio application.

- **Standalone:** Supports manually provided tokens (secure for backends,
  requires care for frontends). The built-in web login flow (`sanity.io/login`) has
  significant limitations for apps on custom domains due to origin restrictions.

## 🚦 Authentication Channels

### 1. Dashboard Apps (Running inside Sanity Dashboard iframe)

- 🎯 **Use Case:** This is the **primary intended use case** for the SDK — that is, applications built to run embedded within an `iframe` in the Sanity Dashboard environment. This includes both customer-built Sanity Apps and internally developed applications like Canvas and Media Library.

- ⚙️ **Mechanism:**

  - **Host-Provided Auth:** Authentication is managed **by the host Dashboard environment**. The Dashboard loads the app's iframe with specific URL parameters. The SDK's `getAuthCode` function looks for the session identifier (`sid`) in the following order: first in the **URL hash** (`#sid=...`), then in the **URL search parameters** (`?sid=...`), and finally as a fallback within the `_context` query parameter (`?_context={"sid":"..."}`). The `_context` parameter is a URL-encoded JSON object that may also contain other context (`orgId`, `mode`, etc.).

  - **Automatic Handling:** On load, the SDK's `authStore` and `handleAuthCallback` detect the `sid` using the logic described above. If an `sid` (auth code) is present, `handleAuthCallback` automatically attempts to exchange it for an authentication token without user interaction or redirects.

  - **No SDK Login Flow:** The SDK's standard login flow (redirecting to `sanity.io/login`) is **not used** in this context. The user is expected to be already authenticated within the host Dashboard.

  - **Communication:** The initial authentication relies on the URL parameters from the host Dashboard.

  - **Client Configuration:** API clients operate using the token obtained from the `sid` exchange, effectively using the user's active Dashboard session. The token will be a global, stamped token that is refreshed every 12 hours.

- 🚧 **Limitations:** Tightly coupled to the Sanity Dashboard environment. Requires the app to be loaded within the dashboard iframe by the host.

- 🛠️ **Technical Details:**

  - `authStore.ts` and `handleAuthCallback` parse `initialLocationHref` for `_context` and `sid` parameters.

  - `handleAuthCallback` triggers the `sid`-for-token exchange via `/auth/fetch`.

  - `AuthBoundary.tsx` detects iframe context (`isInIframe()`) and prevents the SDK's own redirect-based login flow when embedded.

### 2. Sanity Studio Mode (👷 Under construction)

- 🎯 **Use Case:** Using the SDK _within_ the Sanity Studio V3 codebase itself (not running in the dashboard iframe). For instance: in custom input components, tools, or plugins integrated directly into the Studio application.

- ⚙️ **Mechanism:** Enabled by setting `studioMode.enabled: true` in the SDK configuration.

  - **Studio Token (localStorage):** The primary method. `authStore` looks for a token specific to the Studio session stored in `localStorage` under the key `__sanity_auth_token_${projectId}`. This token is project-specific.

  - **Studio Cookie Auth:** As a fallback, if the `localStorage` token is not found, `checkForCookieAuth` is called. This function attempts a request (`withCredentials: true`) to a Studio backend endpoint to verify if a valid HTTP-only session cookie exists. If so, subsequent API requests managed by the SDK client will rely on this cookie for authentication.

- 🚧 **Limitations:**

  - Provides only project-level access (cannot use global tokens/endpoints). Calls to global endpoints will fail.

  - Relies entirely on the authentication context established by the Studio itself.

- 🛠️ **Technical Details:**

  - `authStore` contains specific logic gated by `instance.config.studioMode?.enabled`.

  - `getStudioTokenFromLocalStorage` retrieves the project-specific token.

  - `checkForCookieAuth` initiates the cookie check flow.

  - `clientStore` will configure clients based on the available token or implicitly rely on cookies if `withCredentials` is set appropriately. Clients are only configured for the project-specific endpoint.

### 3. Standalone Applications

- 🎯 **Use Case:** External web applications using the SDK that operate independently of the Sanity Dashboard or Studio (e.g., SDK Explorer, custom internal dashboards). These applications are **not** running inside the Dashboard iframe or as part of the Studio build and they are not hosted on Sanity's domains.

- ⚙️ **Mechanism:**

  - **No Auth:** For accessing only public datasets, `ResourceProvider` can be used without any specific auth configuration. Clients will operate without authentication.

  - **Provided Token:** Developers can manually provide a `token` (either a PAT or a project-scoped token) within the `SanityConfig` when initializing the SDK instance (`createSanityInstance` or via `ResourceProvider`). `authStore` detects and uses this `providedToken`.

    - **Important:** The automatic token refresh mechanism is designed for _stamped_ tokens (those containing `-st`, obtained via the interactive login flow). It will **not** attempt to refresh standard Personal Access Tokens (PATs) or other manually provided, non-stamped tokens. Applications using `providedToken` must be prepared for the token to be refreshed by the SDK if a stamped token is passed in.

  - **Auth Code Flow (Limited Use):** The standard redirect flow (`sanity.io/login` -> callback -> `handleAuthCallback`) can be technically implemented using components like `LoginCallback.tsx` and `AuthBoundary.tsx`. This flow is primarily relevant **only** for this standalone context. However, the `sanity.io/login` endpoint has a strict allowlist for the `origin` parameter. While `localhost` and Sanity domains (`*.sanity.dev`, `*.sanity.work`, `*.sanity.io`) are typically allowed, deploying a standalone app to an arbitrary domain (e.g., `myapp.vercel.app`) will fail this origin check, preventing the flow from completing. However during development of a standalone app, the origin check will pass because localhost is allowed, so the developer can be mistaken to think that a standalone app will continue to work once deployed.

- 🚧 **Limitations:**

  - No straightforward, built-in authentication flow for web applications deployed to arbitrary domains due to the `sanity.io/login` origin restrictions.

  - Frontend applications using `providedToken` need careful consideration regarding token type (project or global and stamped or non-stamped) and security.

- 🛠️ **Technical Details:**

  - `authStore` checks `instance.config.auth.token` for a `providedToken`.

  - `handleAuthCallback` implements the exchange of the `authCode` (`sid`) from the callback URL for a token by calling the `/auth/fetch` endpoint.

  - The `origin` restriction on `sanity.io/login` is the main blocker for a universal web auth solution.

## 🔑 Key Concepts & Technical Details

- **Tokens:**

  - **Types:**

    - **Global Tokens:** Tokens not tied to a specific project, but instead to a Sanity User. It includes access to all of the user's orgs and projects. Required for accessing global Sanity APIs (e.g., project management). Used when `clientStore` configures a client with `scope: 'global'` or without a `projectId`.

    - **Project Tokens:** Scoped to a single project (any of that project's datasets). Used by Studio integration or can be provided manually. Can only be used for project-specific endpoints (`<projectId>.api.sanity.io`).

  - **Stamped Tokens:** Tokens obtained via the `sanity.io/login` flow and from the Dashboard are "stamped" (`type=stampedToken`). Refresh is handled via `refreshStampedToken.ts`. Non-stamped tokens will not be refreshed by the SDK.

  - **Storage:** Primarily `localStorage` (`storageKey` in `authStore` defaults to `__sanity_auth_token`, or `__sanity_auth_token_${projectId}` in Studio mode).

    - **Dashboard Context:** When running within the **Dashboard iframe context (section 1 above)**, the SDK does **not** store the obtained token in its own `localStorage`. Authentication relies on the initial `sid` exchange and potential host-managed sessions. The resulting token will be refreshed by the SDK's internal refresh mechanism.

- **Login Flow (`sanity.io/login`)**

  - Constructed in `authStore.ts`.

  - Requires specific parameters: `origin` (must be allowlisted), `type=stampedToken`, `withSid=true`.

  - Redirects back to the specified `callbackUrl` (or inferred location) with an `authCode` (as `sid` parameter, potentially others like `_context`).

  - `handleAuthCallback.ts` extracts the `authCode` and exchanges it for a `{token}` using the `/auth/fetch?sid=<authCode>` endpoint.

- **API Clients (`clientStore`)**

  - Creates and caches `SanityClient` instances based on configuration.

  - Listens to `getTokenState` changes (`listenToToken`). When the token updates, it clears the client cache (`clients: {}`), forcing regeneration of clients with the new token upon next request.

  - **Client Scope:**

    - `scope: 'global'` or missing `projectId` results in a client configured with `useProjectHostname: false`, targeting global APIs (e.g., `api.sanity.io`). Requires a global token.

    - Default behavior (with `projectId` and `dataset`) uses project-specific hostnames (e.g., `<projectId>.api.sanity.io`).

- **CORS & Endpoints:**

  - **Global Endpoints (e.g., `api.sanity.io`):** Generally have stricter Cross-Origin Resource Sharing (CORS) policies. They primarily allow requests from Sanity's own domains (`*.sanity.io`, `*.sanity.work`), associated development domains (`*.sanity.dev`), and `localhost`. Accessing these from arbitrary external domains is usually blocked by browser CORS rules. They also require global tokens.

  - **Project Endpoints (e.g., `<projectId>.api.sanity.io`):** CORS rules are configured per-project in `manage.sanity.io`. You can add specific origins (like your deployed application's domain) to the allowlist. These endpoints work with project-specific tokens (or cookies in Studio mode).

- **Token Refresh**

  - Runs periodically **only** for stamped tokens identified by containing a `-st` suffix.

  - Calls the `/auth/refresh-token` endpoint using the current stamped token to extend the token's validity or get a new one based on the active session, preventing the user from being logged out unexpectedly in long-lived browser sessions.

    - Uses the Web Locks API (`navigator.locks`) for coordination when running
      outside the dashboard context to prevent multiple tabs from attempting to
      refresh simultaneously. Falls back to uncoordinated refresh if Locks API is
      unavailable.

  - When running inside the dashboard context, it uses a simpler timer mechanism
    as coordination is not needed because each tab/host will have its own `sid` and therefore its own stamped token.
