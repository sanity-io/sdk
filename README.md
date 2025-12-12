<p align="center">
  <a href="https://sanity.io">
    <img src="https://cdn.sanity.io/images/3do82whm/next/d6cf401d52c33b7a5a354a14ab7de94dea2f0c02-192x192.svg" />
  </a>
  <h1 align="center">Sanity App SDK</h1>
</p>

The Sanity App SDK is a robust set of tooling that will let you create fully custom apps that interface and interact with your Sanity content. It brings the powerful real-time capabilities and content management features you know from Sanity Studio to your own custom React applications. With a comprehensive set of React hooks and data stores, you can easily build applications that work seamlessly with your Sanity content across multiple projects and datasets.

Developers can use the SDK to harness enterprise-grade platform capabilities — such as real-time content synchronization, collaborative editing, and permissions management — out of the box and with minimal complexity, unlocking powerful new workflows across their organization.

The Sanity App SDK exposes these platform capabilities via a set of concise, composable React hooks. These programmable building blocks can be used to build out entire custom applications (backed by your choice of UI components or styling solution), while the Sanity CLI makes the creation and deployment of these applications fast and effortless.

## Get Started

```bash
npx sanity@latest init --template app-quickstart
cd your-app
npm run dev
```

This creates a new Sanity App with the React SDK configured and ready to use. Your app will open at `https://www.sanity.io/welcome?dev=http%3A%2F%2Flocalhost%3A3333`, proxied through Sanity Dashboard for automatic authentication.

## Which Package Should I Use?

- **Building a React app?** → Use `@sanity/sdk-react` (most common use case)
- **Building for another framework or need low-level control?** → Use `@sanity/sdk-core` and build your own integration

## Documentation

- Familiarize yourself with the App SDK via a conceptual overview, a quickstart guide, and a step by step walkthrough on **[the Sanity Docs site](https://sanity.io/docs/app-sdk)**
- Go in depth with the **[App SDK reference docs](https://sdk-docs.sanity.dev)**
- View example implementations on the **[SDK Explorer](https://sdk-examples.sanity.dev)**

## Packages

### [@sanity/sdk-react](./packages/react)

React hooks and components for building Sanity Apps. Includes real-time data subscriptions, optimistic updates, document editing, and multi-project support.

- **NPM:** https://www.npmjs.com/package/@sanity/sdk-react
- **Docs:** https://sanity.io/docs/app-sdk
- **Reference:** https://reference.sanity.io/_sanity/sdk-react

### [@sanity/sdk-core](./packages/core)

Framework-agnostic TypeScript core powering the React SDK. Use this if you're building your own framework integration.

- **NPM:** https://www.npmjs.com/package/@sanity/sdk-core

## Repository Structure

```
/packages
  /react        - React SDK implementation
  /core         - Framework-agnostic core
/apps
  /kitchensink-react  - Internal testing & examples app
```

## License

MIT © Sanity.io
